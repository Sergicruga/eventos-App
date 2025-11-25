import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();
const { Pool } = pkg;

const app = express();
const port = process.env.PORT || 4000;

/* ==========================
   CONFIG CARPETAS UPLOADS
   ========================== */

const uploadsBaseDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsBaseDir)) fs.mkdirSync(uploadsBaseDir);

const eventUploadsDir = path.join(uploadsBaseDir, "events");
if (!fs.existsSync(eventUploadsDir)) fs.mkdirSync(eventUploadsDir);

/* ==========================
   MULTER EVENTOS
   ========================== */

const eventStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, eventUploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `event_${Date.now()}${ext}`);
  },
});
const uploadEventImage = multer({ storage: eventStorage });

/* ==========================
   DB POSTGRES
   ========================== */

const isProd = process.env.NODE_ENV === "production";

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // necesario en Render
    })
  : new Pool({
      host: process.env.PGHOST || "localhost",
      port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
      user: process.env.PGUSER || "usuario_eventos",
      password: process.env.PGPASSWORD || "NuevaPass123!",
      database: process.env.PGDATABASE || "eventosdb",
      ssl: false, // local sin SSL
    });

    pool
    .connect()
    .then((c) => {
      console.log("✅ Conectado a PostgreSQL");
      c.release();
    })
    .catch((err) =>
      console.error("❌ Error conectando a PostgreSQL:", err.message)
    );

/* ==========================
   MIDDLEWARES
   ========================== */

// Override de método para soportar POST + ?_method=PATCH/PUT
app.use((req, res, next) => {
  if (req.method === "POST" && req.query._method) {
    req.method = req.query._method.toUpperCase();
  }
  next();
});

app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method !== "GET") console.log("BODY:", req.body);
  next();
});

// Servir archivos estáticos (perfil + eventos)
app.use("/uploads", express.static(uploadsBaseDir));

/* ==========================
   HELPERS
   ========================== */

const isNumericId = (v) => /^\d+$/.test(String(v ?? ""));

/**
 * Normaliza :eventId
 * - Si es numérico → lo usa directo
 * - Si es externo (tm-...) → lo busca en api_events
 */
app.param("eventId", async (req, res, next, rawId) => {
  try {
    if (isNumericId(rawId)) {
      req.eventId = Number(rawId);
      return next();
    }

    const source = req.query.source || req.body?.source;
    const externalId = req.query.externalId || req.body?.externalId || rawId;

    if (!source || !externalId) {
      return res.status(400).json({
        error: "eventId_externo_necesita_source_y_externalId",
        detail: "Usa ?source=ticketmaster&externalId=tm-XXXX o envíalos en el body.",
      });
    }

    const r = await pool.query(
      "SELECT event_id FROM api_events WHERE source=$1 AND external_id=$2",
      [source, externalId]
    );
    if (!r.rows.length || !r.rows[0].event_id) {
      return res.status(404).json({
        error: "evento_externo_no_enlazado",
        detail: `No existe mapeo en api_events(source='${source}', external_id='${externalId}')`,
      });
    }

    req.eventId = r.rows[0].event_id;
    return next();
  } catch (e) {
    console.error("app.param(eventId) ERROR:", e);
    return res.status(500).json({ error: "resolver_evento_falló", detail: e.message });
  }
});

/* ==========================
   HEALTH
   ========================== */

app.get("/", (_req, res) => res.json({ ok: true, msg: "API viva" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ==========================
   EVENTS
   ========================== */

// GET /events  (con / sin userId → favoritos/asistentes)
app.get("/events", async (req, res) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;

    if (!userId) {
      const { rows } = await pool.query(
        `SELECT e.id, e.title, e.description, e.event_at, e.location, e.type, e.image,
                e.latitude, e.longitude, e.created_by
           FROM events e
          ORDER BY e.event_at DESC`
      );
      return res.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT 
          e.*,
          EXISTS (
            SELECT 1 FROM event_favorites f
            WHERE f.event_id = e.id AND f.user_id = $1
          ) AS is_favorite,
          EXISTS (
            SELECT 1 FROM event_attendees a
            WHERE a.event_id = e.id AND a.user_id = $1
          ) AS is_attending,
          COALESCE(
            (SELECT COUNT(*)::int FROM event_attendees a WHERE a.event_id = e.id),
            0
          ) AS attendees_count
       FROM events e
       ORDER BY e.event_at DESC`,
      [userId]
    );

    res.json(rows);
  } catch (e) {
    console.error("PG ERROR:", e);
    res.status(500).json({ error: "Error listando eventos" });
  }
});

// POST /events  (crear evento)
app.post("/events", async (req, res) => {
  try {
    let {
      title,
      description,
      event_at,
      location,
      type,
      image,
      latitude,
      longitude,
      created_by,
    } = req.body;

    const DEFAULT_EVENT_IMAGE = "/assets/iconoApp.png";

    if (
      !image ||
      String(image).trim() === "" ||
      String(image).startsWith("https://placehold.co/")
    ) {
      image = DEFAULT_EVENT_IMAGE;
    }

    const createdByInt = created_by ? Number(created_by) : null;

    const { rows } = await pool.query(
      `INSERT INTO events (title, description, event_at, location, type, image, latitude, longitude, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, title, description, event_at, location, type, image, latitude, longitude, created_by`,
      [title, description, event_at, location, type, image, latitude, longitude, createdByInt]
    );

    const row = rows[0];

    if (row?.created_by) {
      const u = await pool.query(`SELECT name FROM users WHERE id=$1`, [row.created_by]);
      row.created_by_name = u.rows[0]?.name || null;
    } else {
      row.created_by_name = null;
    }

    res.status(201).json(row);
  } catch (e) {
    console.error("PG ERROR:", e.message, e.detail, e.hint);
    res.status(500).json({ error: "Error creando evento", detail: e.message });
  }
});

// DELETE /events/:eventId
app.delete("/events/:eventId", async (req, res) => {
  const eventId = req.eventId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM event_attendees WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_favorites WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_comments  WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM api_events      WHERE event_id = $1`, [eventId]);

    const del = await client.query(`DELETE FROM events WHERE id = $1 RETURNING id`, [eventId]);

    if (del.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    await client.query("COMMIT");
    return res.status(204).send();
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("DELETE /events/:eventId error:", e);
    return res.status(500).json({ error: "Error eliminando el evento" });
  } finally {
    client.release();
  }
});

// PATCH /events/:eventId  (actualizar evento - handler único)
app.patch("/events/:eventId", async (req, res) => {
  const eventId = req.eventId;

  const {
    title,
    description,
    event_at, // el cliente manda el datetime aquí
    location,
    type,
    image,
    latitude,
    longitude,
  } = req.body || {};

  const set = [];
  const values = [];
  let i = 1;

  const pushIfDefined = (field, value) => {
    if (typeof value !== "undefined") {
      set.push(`${field} = $${i++}`);
      values.push(
        field === "latitude" || field === "longitude"
          ? value === null
            ? null
            : Number(value)
          : value
      );
    }
  };

  pushIfDefined("title", title);
  pushIfDefined("description", description);
  pushIfDefined("event_at", event_at);
  pushIfDefined("location", location);
  pushIfDefined("type", type);
  pushIfDefined("image", image);
  pushIfDefined("latitude", latitude);
  pushIfDefined("longitude", longitude);

  if (set.length === 0) {
    return res.status(400).json({ error: "No hay campos para actualizar" });
  }

  values.push(eventId);

  try {
    const { rows } = await pool.query(
      `
      UPDATE events
         SET ${set.join(", ")}
       WHERE id = $${i}
       RETURNING id, title, description, event_at, location, type, image, latitude, longitude, created_by
      `,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    res.json(rows[0]);
  } catch (e) {
    console.error("PATCH /events error:", e);
    res.status(500).json({ error: "Error actualizando evento" });
  }
});

// PUT /events/:eventId → reutiliza PATCH
app.put("/events/:eventId", (req, res) => {
  req.method = "PATCH";
  app._router.handle(req, res);
});

// Subir imagen de evento
app.post("/events/upload", uploadEventImage.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No se subió ninguna imagen" });
  }

  const oldImagePath = req.body.oldImagePath;
  if (
    oldImagePath &&
    typeof oldImagePath === "string" &&
    oldImagePath.startsWith("/uploads/events/")
  ) {
    const fullPath = path.join(process.cwd(), oldImagePath);
    fs.unlink(fullPath, (err) => {
      if (err) {
        console.warn("No se pudo borrar la imagen anterior:", fullPath, err.message);
      }
    });
  }

  res.json({ path: `/uploads/events/${req.file.filename}` });
});

/* ==========================
   USUARIOS / PERFIL / AMIGOS
   ========================== */

// Buscar usuarios por nombre/email
app.get("/users/search", async (req, res) => {
  const { q, userId } = req.query;
  const { rows } = await pool.query(
    `SELECT id, name, email, photo
     FROM users
     WHERE (LOWER(name) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1))
       AND id != $2
     LIMIT 20`,
    [`%${q || ""}%`, userId]
  );
  res.json(rows);
});

// Obtener datos de un usuario
app.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, name, email, photo FROM users WHERE id = $1`,
    [userId]
  );
  if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(rows[0]);
});

// Actualizar nombre de usuario
app.put("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nombre requerido" });
  await pool.query("UPDATE users SET name = $1 WHERE id = $2", [name, userId]);
  res.json({ success: true });
});

/* ==== FOTO PERFIL ==== */

// Configuración multer para fotos de perfil (reusa uploadsBaseDir)
const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsBaseDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `profile_${req.params.userId}${ext}`);
  },
});
const uploadProfile = multer({ storage: profileStorage });

// Subir foto de perfil
app.post("/users/:userId/photo", uploadProfile.single("photo"), async (req, res) => {
  const { userId } = req.params;
  const photoUrl = `/uploads/${req.file.filename}`;
  await pool.query("UPDATE users SET photo = $1 WHERE id = $2", [photoUrl, userId]);
  res.json({ photo: photoUrl });
});

/* ==== AMIGOS ==== */

app.get("/users/:userId/friends", async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.photo
     FROM friends f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = $1`,
    [userId]
  );
  res.json(rows);
});

// Añadir amigo (por /users/:userId/friends)
app.post("/users/:userId/friends", async (req, res) => {
  const { userId } = req.params;
  const { friendId } = req.body;
  await pool.query(
    `INSERT INTO friends (user_id, friend_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, friendId]
  );
  res.json({ success: true });
});

// Eliminar amigo desde /users/:userId/friends/:friendId (bidireccional)
app.delete("/users/:userId/friends/:friendId", async (req, res) => {
  const { userId, friendId } = req.params;
  try {
    await pool.query(
      `DELETE FROM friends
       WHERE (user_id = $1 AND friend_id = $2)
          OR (user_id = $2 AND friend_id = $1)`,
      [userId, friendId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting friendship:", err);
    res.status(500).json({ error: "Failed to delete friendship" });
  }
});

// Añadir amigo (legacy /friends)
app.post("/friends", async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId || userId === friendId) {
    return res.status(400).json({ error: "Datos inválidos" });
  }
  await pool.query(
    "INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, friendId]
  );
  res.json({ success: true });
});

// Listar amigos (legacy /friends/:userId)
app.get("/friends/:userId", async (req, res) => {
  const { userId } = req.params;
  const result = await pool.query(
    `SELECT u.id, u.name, u.email
     FROM friends f
     JOIN users u ON u.id = f.friend_id
     WHERE f.user_id = $1`,
    [userId]
  );
  res.json(result.rows);
});

// Eliminar amigo (legacy /friends - body)
app.delete("/friends", async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) {
    return res.status(400).json({ error: "userId and friendId required" });
  }
  try {
    await pool.query(
      "DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
      [userId, friendId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete friendship" });
  }
});

/* ==== EVENTOS CREADOS / ASISTIDOS / FAVORITOS POR USUARIO ==== */

// Eventos creados por el usuario (perfil pestaña "Creados")
app.get("/users/:userId/events-created", async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, title, description, event_at, location, type, image, latitude, longitude
       FROM events
      WHERE created_by = $1
      ORDER BY event_at DESC`,
    [userId]
  );
  res.json(rows);
});

// Eventos de un amigo
app.get("/users/:friendId/events", async (req, res) => {
  const { friendId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, title, description, event_at, location, type, image
       FROM events
      WHERE created_by = $1
      ORDER BY event_at DESC`,
    [friendId]
  );
  res.json(rows);
});

// Eventos a los que un usuario asiste (perfil pestaña "Asistes")
// Versión única → shape consistente con events-created
app.get("/users/:userId/events-attending", async (req, res) => {
  const { userId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.description, e.event_at, e.location, e.type, e.image,
              e.latitude, e.longitude
         FROM event_attendees ea
         JOIN events e ON e.id = ea.event_id
        WHERE ea.user_id = $1
        ORDER BY e.event_at DESC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error("Error cargando eventos a los que asiste el usuario:", err);
    res.status(500).json({ error: "Error cargando eventos a los que asistes" });
  }
});

/* ==========================
   FAVORITOS
   ========================== */

// Marcar evento como favorito usando :eventId normalizado
app.post("/events/:eventId/favorite", async (req, res) => {
  const eventId = req.eventId;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId requerido" });
  await pool.query(
    `INSERT INTO event_favorites (user_id, event_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Quitar favorito usando :eventId
app.delete("/events/:eventId/favorite", async (req, res) => {
  const eventId = req.eventId;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId requerido" });
  await pool.query(
    `DELETE FROM event_favorites WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Obtener IDs de favoritos de un usuario
app.get("/users/:userId/favorites", async (req, res) => {
  const { userId } = req.params;
  const result = await pool.query(
    `SELECT event_id FROM event_favorites WHERE user_id = $1`,
    [userId]
  );
  res.json(result.rows.map((r) => r.event_id));
});

// Obtener eventos favoritos completos
app.get("/users/:userId/favorites/events", async (req, res) => {
  const { userId } = req.params;
  const result = await pool.query(
    `SELECT e.id, e.title, e.description, e.event_at, e.location, e.type, e.image,
            e.latitude, e.longitude
       FROM event_favorites f
       JOIN events e ON e.id = f.event_id
      WHERE f.user_id = $1
      ORDER BY e.event_at DESC`,
    [userId]
  );
  res.json(result.rows);
});

// Legacy /favorites (body userId, eventId)
app.post("/favorites", async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const eventId = Number(req.body.eventId);
    console.log("POST /favorites", { userId, eventId });
    if (!Number.isInteger(userId) || !Number.isInteger(eventId)) {
      return res.status(400).json({ error: "userId/eventId inválidos" });
    }
    await pool.query(
      `INSERT INTO event_favorites (user_id, event_id)
       VALUES ($1::bigint, $2::bigint) ON CONFLICT DO NOTHING`,
      [userId, eventId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("POST /favorites ERROR:", e);
    res.status(500).json({ error: "Error añadiendo favorito" });
  }
});

app.delete("/favorites", async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const eventId = Number(req.body.eventId);
    console.log("DELETE /favorites", { userId, eventId });
    await pool.query(
      `DELETE FROM event_favorites WHERE user_id = $1::bigint AND event_id = $2::bigint`,
      [userId, eventId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /favorites ERROR:", e);
    res.status(500).json({ error: "Error quitando favorito" });
  }
});

// Endpoint legacy /api/favorites/:id (tabla "favorites" antigua)
app.get("/api/favorites/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query("SELECT * FROM favorites WHERE event_id = $1", [id]);
    if (!rows.length) return res.status(404).json({ message: "No encontrado" });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error del servidor" });
  }
});

/* ==========================
   ASISTENTES
   ========================== */

// Apuntarse (legacy body userId, eventId)
app.post("/attendees", async (req, res) => {
  const { userId, eventId } = req.body;
  if (!userId || !eventId)
    return res.status(400).json({ error: "userId y eventId requeridos" });

  await pool.query(
    `INSERT INTO event_attendees (user_id, event_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Dejar de asistir
app.delete("/attendees", async (req, res) => {
  const { userId, eventId } = req.body;
  if (!userId || !eventId)
    return res.status(400).json({ error: "userId y eventId requeridos" });

  await pool.query(
    `DELETE FROM event_attendees WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Obtener asistentes de un evento
app.get("/events/:eventId/attendees", async (req, res) => {
  const eventId = req.eventId;
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.name
         FROM event_attendees a
         JOIN users u ON u.id = a.user_id
        WHERE a.event_id = $1`,
      [eventId]
    );
    res.json(rows);
  } catch (e) {
    console.error("Error fetching attendees:", e);
    res.status(500).json({ error: "Error fetching attendees" });
  }
});

// Comprobar si un usuario asiste
app.get("/events/:eventId/attendees/:userId", async (req, res) => {
  const eventId = req.eventId;
  const { userId } = req.params;
  const r = await pool.query(
    `SELECT 1 FROM event_attendees WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );
  res.json({ attending: r.rowCount > 0 });
});

/* ==========================
   COMENTARIOS
   ========================== */

app.get("/events/:eventId/comments", async (req, res) => {
  const eventId = req.eventId;
  const { rows } = await pool.query(
    `SELECT ec.id, ec.comment, ec.created_at, u.name
       FROM event_comments ec
       JOIN users u ON ec.user_id = u.id
      WHERE ec.event_id = $1
      ORDER BY ec.created_at DESC`,
    [eventId]
  );
  res.json(rows);
});

app.post("/events/:eventId/comments", async (req, res) => {
  const eventId = req.eventId;
  const { userId, comment } = req.body;
  if (!userId || !comment)
    return res.status(400).json({ error: "userId y comment requeridos" });

  const { rows } = await pool.query(
    `INSERT INTO event_comments (event_id, user_id, comment)
     VALUES ($1, $2, $3)
     RETURNING id, comment, created_at`,
    [eventId, userId, comment]
  );
  res.status(201).json(rows[0]);
});

/* ==========================
   AUTH (registro / login)
   ========================== */

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_super_largo_cámbialo";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Campos obligatorios" });

    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rowCount > 0)
      return res.status(409).json({ message: "El email ya está registrado" });

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, email, password)
       VALUES ($1, $2, $3)
       RETURNING id, name, email`,
      [name, email, hash]
    );

    const user = result.rows[0];
    const token = signToken({ id: user.id, email: user.email });
    res.json({ user, token });
  } catch (e) {
    console.error("REGISTER ERROR:", e);
    res.status(500).json({ message: "Error registrando usuario" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "Email y contraseña requeridos" });

    const result = await pool.query(
      "SELECT id, name, email, password FROM users WHERE email = $1",
      [email]
    );
    if (result.rowCount === 0)
      return res.status(401).json({ message: "Credenciales inválidas" });

    const userRow = result.rows[0];
    const ok = await bcrypt.compare(password, userRow.password);
    if (!ok) return res.status(401).json({ message: "Credenciales inválidas" });

    const user = { id: userRow.id, name: userRow.name, email: userRow.email };
    const token = signToken({ id: user.id, email: user.email });
    res.json({ user, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error al iniciar sesión" });
  }
});

/* ==========================
   START SERVER
   ========================== */

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API escuchando en http://localhost:${port}`);
});
