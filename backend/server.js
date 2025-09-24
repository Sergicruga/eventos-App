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

// health
app.get("/", (_req, res) => res.json({ ok: true, msg: "API viva" }));

// /events a prueba de tipos (PostgreSQL)
app.get("/events", async (req, res) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;

    // SIN userId: SELECT limpio
    if (!userId) {
      const { rows } = await pool.query(
        `SELECT e.id, e.title, e.description, e.event_at, e.location, e.type, e.image,
                e.latitude, e.longitude, e.created_by
           FROM events e
          ORDER BY e.event_at DESC`
      );
      return res.json(rows);
    }

    // CON userId: LEFT JOIN favoritos (cast explícito para evitar integer=text)
    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.description, e.event_at, e.location, e.type, e.image,
              e.latitude, e.longitude, e.created_by
         FROM events e
        ORDER BY e.event_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error("PG ERROR:", e);
    res.status(500).json({ error: "Error listando eventos" });
  }
});


app.post("/events", async (req, res) => {
  try {
    const { title, description, event_at, location, type, image, latitude, longitude, created_by } = req.body;
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
    res.status(201).json(rows);
  } catch (e) {
    console.error("PG ERROR:", e.message, e.detail, e.hint);
    res.status(500).json({ error: "Error creando evento", detail: e.message});
  }
});


// Search users by name or email
app.get('/users/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const result = await pool.query(
    'SELECT id, name, email FROM users WHERE name ILIKE $1 OR email ILIKE $1 LIMIT 20',
    [`%${q}%`]
  );
  res.json(result.rows);
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

// Servir imágenes de perfil
app.use("/uploads", express.static(uploadDir));

// Eliminar amigo (bidireccional)
app.delete('/friends', async (req, res) => {
  const { userId, friendId } = req.body;
  if (!userId || !friendId) return res.status(400).json({ error: 'Datos inválidos' });
  await pool.query(
    'DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
    [userId, friendId]
  );
  res.json({ success: true });
});

// Obtener comentarios de un evento
app.get('/events/:eventId/comments', async (req, res) => {
  const { eventId } = req.params;
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

// Añadir comentario a un evento
app.post('/events/:eventId/comments', async (req, res) => {
  const { eventId } = req.params;
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

// Marcar evento como favorito
app.post('/events/:eventId/favorite', async (req, res) => {
  const { eventId } = req.params;
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

// Quitar favorito
app.delete('/events/:eventId/favorite', async (req, res) => {
  const { eventId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId requerido' });
  await pool.query(
    `DELETE FROM event_favorites WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
  res.json({ success: true });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API escuchando en http://localhost:${port}`);
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

// Marcar favorito
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

// Apuntarse a un evento
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

// Dejar de asistir
app.delete('/attendees', async (req, res) => {
  const { userId, eventId } = req.body;
  if (!userId || !eventId) return res.status(400).json({ error: 'userId y eventId requeridos' });

  await pool.query(
    `DELETE FROM event_attendees WHERE user_id = $1 AND event_id = $2`,
    [userId, eventId]
  );
  res.json({ success: true });
});

// Listar asistentes (nombres y foto)
app.get('/events/:eventId/attendees', async (req, res) => {
  const { eventId } = req.params;
  const result = await pool.query(
    `SELECT u.id, u.name, u.photo
     FROM event_attendees a
     JOIN users u ON u.id = a.user_id
     WHERE a.event_id = $1
     ORDER BY u.name ASC`,
    [eventId]
  );
  res.json(result.rows);
});

// (Opcional) comprobar si un usuario asiste
app.get('/events/:eventId/attendees/:userId', async (req, res) => {
  const { eventId, userId } = req.params;
  const r = await pool.query(
    `SELECT 1 FROM event_attendees WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId]
  );
  res.json({ attending: r.rowCount > 0 });
});


