import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

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

app.get("/events", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, description, event_at, location, type, image, latitude, longitude
       FROM eventos ORDER BY event_at DESC`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error listando eventos" });
  }
});

app.post("/events", async (req, res) => {
  try {
    const { title, description, event_at, location, type, image, latitude, longitude } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO eventos (title, description, event_at, location, type, image, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [title, description, event_at, location, type, image, latitude, longitude]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Error creando evento" });
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
  const result = await pool.query(
    `SELECT c.id, c.comment, c.created_at, u.name, u.photo
     FROM event_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.event_id = $1
     ORDER BY c.created_at ASC`,
    [eventId]
  );
  res.json(result.rows);
});

// Añadir comentario a un evento
app.post('/events/:eventId/comments', async (req, res) => {
  const { eventId } = req.params;
  const { userId, comment } = req.body;
  if (!userId || !comment) return res.status(400).json({ error: 'Datos requeridos' });
  const result = await pool.query(
    `INSERT INTO event_comments (event_id, user_id, comment)
     VALUES ($1, $2, $3) RETURNING id, comment, created_at`,
    [eventId, userId, comment]
  );
  res.status(201).json(result.rows[0]);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API escuchando en http://localhost:${port}`);
});
