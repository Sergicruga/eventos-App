import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";

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

app.listen(port, "0.0.0.0", () => {
  console.log(`✅ API escuchando en http://localhost:${port}`);
});
