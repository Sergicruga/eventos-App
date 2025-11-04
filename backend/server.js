import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const uploadsBaseDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsBaseDir)) fs.mkdirSync(uploadsBaseDir);

const eventUploadsDir = path.join(uploadsBaseDir, "events");
if (!fs.existsSync(eventUploadsDir)) fs.mkdirSync(eventUploadsDir);

// Multer storage para eventos
const eventStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, eventUploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `event_${Date.now()}${ext}`);
  },
});
const uploadEventImage = multer({ storage: eventStorage });

dotenv.config();
const { Pool } = pkg;

const app = express();

// Middleware para soportar override de método (POST + ?_method=PATCH/PUT)
app.use((req, res, next) => {
  if (req.method === 'POST' && req.query._method) {
    req.method = req.query._method.toUpperCase();
  }
  next();
});

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method !== 'GET') console.log('BODY:', req.body);
  next();
});

const port = process.env.PORT || 4000;

// Lee cada variable (crea estas en tu .env)
const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
  user: process.env.PGUSER || "usuario_eventos",
  password: process.env.PGPASSWORD || "NuevaPass123!",
  database: process.env.PGDATABASE || "eventosdb",
  // ssl: { rejectUnauthorized: false } // si algún día te conectas a un servidor con SSL
});

pool.connect()
  .then(c => { console.log("✅ Conectado a PostgreSQL"); c.release(); })
  .catch(err => console.error("❌ Error conectando a PostgreSQL:", err.message));

/* ============================================================
   Middleware para normalizar :eventId (soporta IDs externos)
   ============================================================ */
const isNumericId = v => /^\d+$/.test(String(v ?? ''));

app.param('eventId', async (req, res, next, rawId) => {
  try {
    // Si es numérico, úsalo tal cual
    if (isNumericId(rawId)) {
      req.eventId = Number(rawId);
      return next();
    }

    // Si es alfanumérico (tm-...), necesitamos source y externalId
    const source = req.query.source || req.body?.source;
    const externalId = req.query.externalId || req.body?.externalId || rawId;

    if (!source || !externalId) {
      return res.status(400).json({
        error: 'eventId_externo_necesita_source_y_externalId',
        detail: 'Usa ?source=ticketmaster&externalId=tm-XXXX o envíalos en el body.'
      });
    }

    // Traducir api_events -> events.id
    const r = await pool.query(
      'SELECT event_id FROM api_events WHERE source=$1 AND external_id=$2',
      [source, externalId]
    );
    if (!r.rows.length || !r.rows[0].event_id) {
      return res.status(404).json({
        error: 'evento_externo_no_enlazado',
        detail: `No existe mapeo en api_events(source='${source}', external_id='${externalId}')`
      });
    }

    req.eventId = r.rows[0].event_id; // id interno numérico
    return next();
  } catch (e) {
    console.error('app.param(eventId) ERROR:', e);
    return res.status(500).json({ error: 'resolver_evento_falló', detail: e.message });
  }
});

// health
app.get("/", (_req, res) => res.json({ ok: true, msg: "API viva" }));

// /events a prueba de tipos (PostgreSQL)
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

    // Con userId → añade is_favorite, is_attending y attendees_count
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

app.post("/events", async (req, res) => {
  try {
    let { title, description, event_at, location, type, image, latitude, longitude, created_by } = req.body;
    const DEFAULT_EVENT_IMAGE = "/assets/iconoApp.png"; // Use your local asset path

    // Treat empty, null, or placeholder URL as "no image"
    if (
      !image ||
      String(image).trim() === "" ||
      String(image).startsWith("https://placehold.co/")
    ) {
      image = DEFAULT_EVENT_IMAGE;
    }
     // created_by debe ser integer o null
    const createdByInt = created_by ? Number(created_by) : null;
    const { rows } = await pool.query(
      `INSERT INTO events (title, description, event_at, location, type, image, latitude, longitude, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, title, description, event_at, location, type, image, latitude, longitude, created_by`,
       [title, description, event_at, location, type, image, latitude, longitude, createdByInt]
    );
    // Añade created_by_name en la respuesta para que el front lo pinte sin otra query
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
    res.status(500).json({ error: "Error creando evento", detail: e.message});
  }
});

// Buscar usuarios (por nombre o email, excluyendo a uno mismo)
app.get('/users/search', async (req, res) => {
  const { q, userId } = req.query;
  const { rows } = await pool.query(
    `SELECT id, name, email, photo
     FROM users
     WHERE (LOWER(name) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1))
       AND id != $2
     LIMIT 20`,
    [`%${q || ''}%`, userId]
  );
  res.json(rows);
});

// Search users by name or email (second endpoint)
app.get('/users/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const result = await pool.query(
    'SELECT id, name, email, photo FROM users WHERE name ILIKE $1 OR email ILIKE $1 LIMIT 20',
    [`%${q}%`]
  );
  res.json(result.rows);
});

// Obtener amigos
app.get('/users/:userId/friends', async (req, res) => {
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

// Añadir amigo
app.post('/users/:userId/friends', async (req, res) => {
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

// Eliminar amigo
app.delete('/users/:userId/friends/:friendId', async (req, res) => {
  const { userId, friendId } = req.params;
  try {
    await pool.query(
      `DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [userId, friendId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting friendship:", err);
    res.status(500).json({ error: "Failed to delete friendship" });
  }
});

// Obtener eventos de un amigo
app.get('/users/:friendId/events', async (req, res) => {
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

// Add friend
app.post('/friends', async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId || userId === friendId) return res.status(400).json({ error: 'Datos inválidos' });
  await pool.query(
    'INSERT INTO friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, friendId]
  );
  res.json({ success: true });
});

// List friends
app.get('/friends/:userId', async (req, res) => {
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

// Events a los que un usuario se ha apuntado
app.get('/users/:userId/events', async (req, res) => {
  const { userId } = req.params;
  const result = await pool.query(
    `SELECT e.id, e.title, e.description, e.event_at AS date, e.location
     FROM event_attendees ea
     JOIN events e ON e.id = ea.event_id
     WHERE ea.user_id = $1
     ORDER BY e.event_at DESC`,
    [userId]
  );
  res.json(result.rows);
});

// Configuración de multer para subir imágenes de perfil
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `profile_${req.params.userId}${ext}`);
  }
});
const upload = multer({ storage });

// Actualizar nombre de usuario
app.put("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Nombre requerido" });
  await pool.query("UPDATE users SET name = $1 WHERE id = $2", [name, userId]);
  res.json({ success: true });
});

// Subir foto de perfil
app.post("/users/:userId/photo", upload.single("photo"), async (req, res) => {
  const { userId } = req.params;
  const photoUrl = `/uploads/${req.file.filename}`;
  await pool.query("UPDATE users SET photo = $1 WHERE id = $2", [photoUrl, userId]);
  res.json({ photo: photoUrl });
});
// GET /users/:userId/created-events
app.get('/users/:userId/created-events', async (req, res) => {
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

// Servir imágenes de perfil
app.use("/uploads", express.static(uploadDir));

// Eliminar amigo (bidireccional)
app.delete('/friends', async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) {
    return res.status(400).json({ error: "userId and friendId required" });
  }
  try {
    await pool.query(
      'DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [userId, friendId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete friendship" });
  }
});

// Obtener comentarios de un evento (usa req.eventId)
app.get('/events/:eventId/comments', async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado
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

// Añadir comentario a un evento (usa req.eventId)
app.post('/events/:eventId/comments', async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado
  const { userId, comment } = req.body;
  if (!userId || !comment) return res.status(400).json({ error: 'userId y comment requeridos' });
  const { rows } = await pool.query(
    `INSERT INTO event_comments (event_id, user_id, comment)
     VALUES ($1, $2, $3)
     RETURNING id, comment, created_at`,
    [eventId, userId, comment]
  );
  res.status(201).json(rows[0]);
});

// =================== AUTH (registro / login) ===================
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_super_largo_cámbialo";

// crea tokens
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/**
 * POST /auth/register
 * body: { name, email, password }
 * devuelve: { user: {id,name,email}, token }
 */
app.post("/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "Campos obligatorios" });

    // ¿email ya existe?
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

/**
 * POST /auth/login
 * body: { email, password }
 * devuelve: { user: {id,name,email}, token }
 */
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

// Marcar evento como favorito (usa req.eventId)
app.post('/events/:eventId/favorite', async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });
  await pool.query(
    `INSERT INTO event_favorites (user_id, event_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Quitar favorito (usa req.eventId)
app.delete('/events/:eventId/favorite', async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });
  await pool.query(
    `DELETE FROM event_favorites WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// === FAVORITOS ===

// Obtener IDs de favoritos de un usuario
app.get('/users/:userId/favorites', async (req, res) => {
  const { userId } = req.params;
  const result = await pool.query(
    `SELECT event_id FROM event_favorites WHERE user_id = $1`,
    [userId]
  );
  res.json(result.rows.map(r => r.event_id));
});

// Obtener eventos favoritos completos
app.get('/users/:userId/favorites/events', async (req, res) => {
  const { userId } = req.params;
  const result = await pool.query(
    `SELECT e.id, e.title, e.description, e.event_at, e.location, e.type, e.image, e.latitude, e.longitude
     FROM event_favorites f
     JOIN events e ON e.id = f.event_id
     WHERE f.user_id = $1
     ORDER BY e.event_at DESC`,
    [userId]
  );
  res.json(result.rows);
});

// Marcar favorito (legacy por body numérico; lo dejo tal cual)
app.post('/favorites', async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const eventId = Number(req.body.eventId);
    console.log('POST /favorites', { userId, eventId });
    if (!Number.isInteger(userId) || !Number.isInteger(eventId)) {
      return res.status(400).json({ error: 'userId/eventId inválidos' });
    }
    await pool.query(
      `INSERT INTO event_favorites (user_id, event_id)
       VALUES ($1::bigint, $2::bigint) ON CONFLICT DO NOTHING`,
      [userId, eventId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('POST /favorites ERROR:', e);
    res.status(500).json({ error: 'Error añadiendo favorito' });
  }
});

app.delete('/favorites', async (req, res) => {
  try {
    const userId = Number(req.body.userId);
    const eventId = Number(req.body.eventId);
    console.log('DELETE /favorites', { userId, eventId });
    await pool.query(
      `DELETE FROM event_favorites WHERE user_id = $1::bigint AND event_id = $2::bigint`,
      [userId, eventId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /favorites ERROR:', e);
    res.status(500).json({ error: 'Error quitando favorito' });
  }
});

// === ASISTENTES ===

// Apuntarse a un evento (legacy por body; lo dejo igual)
app.post('/attendees', async (req, res) => {
  const { userId, eventId } = req.body;
  if (!userId || !eventId) return res.status(400).json({ error: 'userId y eventId requeridos' });

  await pool.query(
    `INSERT INTO event_attendees (user_id, event_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Dejar de asistir (legacy por body; lo dejo igual)
app.delete('/attendees', async (req, res) => {
  const { userId, eventId } = req.body;
  if (!userId || !eventId) return res.status(400).json({ error: 'userId y eventId requeridos' });

  await pool.query(
    `DELETE FROM event_attendees WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Obtener asistentes de un evento (usa req.eventId)
app.get('/events/:eventId/attendees', async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado
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

// (Opcional) comprobar si un usuario asiste (usa req.eventId)
app.get('/events/:eventId/attendees/:userId', async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado
  const { userId } = req.params;
  const r = await pool.query(
    `SELECT 1 FROM event_attendees WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );
  res.json({ attending: r.rowCount > 0 });
});

// Obtener datos de un usuario
app.get("/users/:userId", async (req, res) => {
  const { userId } = req.params;
  const { rows } = await pool.query(
    `SELECT id, name, email, photo FROM users WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(rows[0]);
});

// Eventos creados por el usuario
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

// Servir archivos estáticos
app.use('/uploads', express.static(uploadsBaseDir));
// Healthcheck explícito
app.get("/health", (_req, res) => res.json({ ok: true }));

// =================== DELETE EVENTO ===================
// Usa req.eventId (normalizado por app.param), sin Number(...)
app.delete("/events/:eventId", async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Borrar dependencias primero si NO tienes ON DELETE CASCADE
    await client.query(`DELETE FROM event_attendees WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_favorites WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_comments  WHERE event_id = $1`, [eventId]);
    // ✅ limpiar mapeos de eventos externos
    await client.query(`DELETE FROM api_events WHERE event_id = $1`, [eventId]);

    // Borrar el evento
    const del = await client.query(`DELETE FROM events WHERE id = $1 RETURNING id`, [eventId]);

    if (del.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    await client.query("COMMIT");
    return res.status(204).send(); // éxito, sin contenido
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("DELETE /events/:eventId error:", e);
    return res.status(500).json({ error: "Error eliminando el evento" });
  } finally {
    client.release();
  }
});

// === ACTUALIZAR EVENTO ===
// Handler 1 (usa req.eventId)
app.patch("/events/:eventId", async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado

  // Campos permitidos
  const {
    title,
    description,
    event_at,      // ← OJO: tu cliente mapea date -> event_at
    location,
    type,
    image,
    latitude,
    longitude,
  } = req.body || {};

  // Construcción dinámica del UPDATE (solo campos definidos)
  const set = [];
  const values = [];
  let i = 1;

  const pushIfDefined = (field, value) => {
    if (typeof value !== "undefined") {
      set.push(`${field} = $${i++}`);
      values.push(field === 'latitude' || field === 'longitude'
        ? (value === null ? null : Number(value))
        : value);
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

  values.push(eventId); // para el WHERE

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

// Alias con PUT (por si el cliente usa PUT)
app.put("/events/:eventId", async (req, res) => {
  req.method = "PATCH";
  app._router.handle(req, res); // reusa la misma lógica
});

// PATCH duplicado (lo dejo por compatibilidad, pero usa req.eventId)
app.patch('/events/:eventId', async (req, res) => {
  const eventId = req.eventId; // ✅ normalizado

  const allowed = ['title','description','event_at','location','type','image','latitude','longitude'];
  const entries = Object.entries(req.body || {}).filter(([k,v]) => allowed.includes(k) && typeof v !== 'undefined');

  if (entries.length === 0) return res.status(400).json({ error: 'No hay campos para actualizar' });

  const sets = [];
  const values = [];
  let idx = 1;
  for (const [k, v] of entries) {
    sets.push(`${k} = $${idx}`);
    if (k === 'latitude' || k === 'longitude') {
      values.push(v === null ? null : Number(v));
    } else {
      values.push(v);
    }
    idx++;
  }
  values.push(eventId); // último parámetro para WHERE

  const sql = `UPDATE events SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`;
  try {
    const result = await pool.query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Evento no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /events/:eventId error:', err);
    res.status(500).json({ error: 'Error actualizando evento' });
  }
});

// opcional: aceptar PUT con la misma lógica
app.put('/events/:eventId', async (req, res) => {
  // reusar la misma lógica delegando en PATCH handler
  req.method = 'PATCH';
  return app._router.handle(req, res);
});

// === SUBIR IMAGEN DE EVENTO ===
app.post('/events/upload', uploadEventImage.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se subió ninguna imagen' });
  }
  // Elimina la imagen anterior si se proporciona
  const oldImagePath = req.body.oldImagePath;
  if (oldImagePath && typeof oldImagePath === 'string' && oldImagePath.startsWith('/uploads/events/')) {
    const fullPath = path.join(process.cwd(), oldImagePath);
    fs.unlink(fullPath, err => {
      if (err) {
        console.warn('No se pudo borrar la imagen anterior:', fullPath, err.message);
      }
    });
  }
  res.json({ path: `/uploads/events/${req.file.filename}` });
});

app.get('/api/favorites/:id', async (req, res) => {
  try {
    const { id } = req.params; // id como string (ej. "tm-...")
    // Antes (mal): '... WHERE event_id = $1::int', [parseInt(id)]
    const { rows } = await pool.query(
      'SELECT * FROM favorites WHERE event_id = $1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'No encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

app.use(express.json());

/* ====== START ====== */
app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API escuchando en http://localhost:${port}`);
});
