// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { fetchMusicEventsMultipleCities } from "./services/ticketmasterService.js";
import {
  fetchAtrapaloEventsMultipleCities,
  warmAtrapaloCache,
} from "./services/atrapaloService.js";
import {
  fetchMadridOpenDataEvents,
  warmMadridOpenDataCache,
} from "./services/madridOpenDataService.js";
import {
  fetchBarcelonaDibaEvents,
  warmBarcelonaDibaCache,
} from "./services/barcelonaDibaService.js";
import {
  fetchCatalunyaAgendaEvents,
  warmCatalunyaAgendaCache,
} from "./services/catalunyaAgendaService.js";
import {
  fetchValencianaIvcEvents,
  warmValencianaIvcCache,
} from "./services/valencianaIvcService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });
const { Pool } = pkg;

const app = express();

// ⚠️ Render inyecta PORT, en local usas 4000
const PORT = process.env.PORT || 4000;

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

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  ssl: { rejectUnauthorized: false }, // obligatorio con Render
});

pool
  .connect()
  .then((c) => {
    console.log("✅ Conectado a PostgreSQL (Render)");
    c.release();
  })
  .catch((err) => {
    console.error("❌ Error conectando a PostgreSQL:", err.message);
    console.log("⚠️  Continuando sin base de datos (solo para testing de scraping)");
  });

/* ==========================
   EMAIL SETUP
   ========================== */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* ==========================

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
        detail:
          "Usa ?source=ticketmaster&externalId=tm-XXXX o envíalos en el body.",
      });
    }

    const r = await pool.query(
      "SELECT event_id FROM api_events WHERE source=$1 AND external_id=$2",
      [source, externalId]
    );
    if (!r.rows.length || !r.rows[0].event_id) {
      // Intentar crear un evento local mínimo y enlazarlo en api_events
      try {
        const title = req.body?.title || req.query?.title || `Imported event ${externalId}`;
        const description = req.body?.description || req.body?.desc || null;
        const image = req.body?.image || null;
        const eventAt = req.body?.event_at || req.body?.eventAt || null;
        const venueName = req.body?.venueName || req.body?.venue_name || null;
        const city = req.body?.city || null;
        const country = req.body?.country || null;
        const latitude = req.body?.latitude || null;
        const longitude = req.body?.longitude || null;
        const url = req.body?.url || req.query?.url || null;

        console.log(`Auto-creating event for externalId=${externalId} source=${source}`);
        const ins = await pool.query(
          `INSERT INTO events (title, description, image, event_at, venue_name, city, country, latitude, longitude, url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [title, description, image, eventAt, venueName, city, country, latitude, longitude, url]
        );
        const newEventId = ins.rows[0].id;

        // Upsert mapping in api_events so future requests resolve
        try {
          console.log(`Upserting api_events mapping ${source}/${externalId} -> ${newEventId}`);
          const up = await pool.query(
            `INSERT INTO api_events (source, external_id, event_id, title, description, image, event_at, venue_name, city, country, latitude, longitude, url)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (source, external_id) DO UPDATE SET event_id = EXCLUDED.event_id
             RETURNING event_id`,
            [source, externalId, newEventId, title, description, image, eventAt, venueName, city, country, latitude, longitude, url]
          );
          req.eventId = up.rows[0]?.event_id || newEventId;
          return next();
        } catch (eUp) {
          console.error('error upserting api_events mapping:', eUp.message || eUp);
          // fallback: still use created event id
          req.eventId = newEventId;
          return next();
        }
      } catch (eCreate) {
        console.error('error creating local event for externalId:', eCreate.message || eCreate);
        return res.status(404).json({
          error: "evento_externo_no_enlazado",
          detail: `No existe mapeo en api_events(source='${source}', external_id='${externalId}')`,
        });
      }
    }

    req.eventId = r.rows[0].event_id;
    return next();
  } catch (e) {
    console.error("app.param(eventId) ERROR:", e);
    return res
      .status(500)
      .json({ error: "resolver_evento_falló", detail: e.message });
  }
});

/* ==========================
   HEALTH
   ========================== */

app.get("/", (_req, res) => res.json({ ok: true, msg: "API viva" }));
app.get("/health", (_req, res) => res.json({ ok: true }));

const toNumberOrNull = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRad = (degrees) => (degrees * Math.PI) / 180;

const distanceKm = (from, to) => {
  if (
    !from ||
    !to ||
    from.latitude == null ||
    from.longitude == null ||
    to.latitude == null ||
    to.longitude == null
  ) {
    return Infinity;
  }

  const R = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

const nearbyCityCatalog = [
  { name: "Madrid", latitude: 40.4168, longitude: -3.7038 },
  { name: "Barcelona", latitude: 41.3874, longitude: 2.1686 },
  { name: "Valencia", latitude: 39.4699, longitude: -0.3763 },
  { name: "Sevilla", latitude: 37.3891, longitude: -5.9845 },
  { name: "Zaragoza", latitude: 41.6488, longitude: -0.8891 },
  { name: "Málaga", latitude: 36.7213, longitude: -4.4214 },
  { name: "Murcia", latitude: 37.9922, longitude: -1.1307 },
  { name: "Palma", latitude: 39.5696, longitude: 2.6502 },
  { name: "Las Palmas de Gran Canaria", latitude: 28.1235, longitude: -15.4363 },
  { name: "Bilbao", latitude: 43.2630, longitude: -2.9350 },
  { name: "Alicante", latitude: 38.3452, longitude: -0.4810 },
  { name: "Córdoba", latitude: 37.8882, longitude: -4.7794 },
  { name: "Valladolid", latitude: 41.6523, longitude: -4.7245 },
  { name: "Vigo", latitude: 42.2406, longitude: -8.7207 },
  { name: "Gijón", latitude: 43.5322, longitude: -5.6611 },
  { name: "A Coruña", latitude: 43.3623, longitude: -8.4115 },
  { name: "Granada", latitude: 37.1773, longitude: -3.5986 },
  { name: "Vitoria-Gasteiz", latitude: 42.8467, longitude: -2.6727 },
  { name: "Elche", latitude: 38.2699, longitude: -0.7126 },
  { name: "Oviedo", latitude: 43.3619, longitude: -5.8494 },
  { name: "Santa Cruz de Tenerife", latitude: 28.4636, longitude: -16.2518 },
  { name: "Badalona", latitude: 41.4500, longitude: 2.2474 },
  { name: "L'Hospitalet de Llobregat", latitude: 41.3596, longitude: 2.0997 },
  { name: "Girona", latitude: 41.9794, longitude: 2.8214 },
  { name: "Lloret de Mar", latitude: 41.6999, longitude: 2.8456 },
  { name: "Blanes", latitude: 41.6759, longitude: 2.7902 },
  { name: "Mataró", latitude: 41.5381, longitude: 2.4445 },
  { name: "Sabadell", latitude: 41.5463, longitude: 2.1086 },
  { name: "Terrassa", latitude: 41.5632, longitude: 2.0089 },
  { name: "Tarragona", latitude: 41.1189, longitude: 1.2445 },
  { name: "Lleida", latitude: 41.6176, longitude: 0.6200 },
  { name: "Reus", latitude: 41.1498, longitude: 1.1055 },
  { name: "Castellón de la Plana", latitude: 39.9864, longitude: -0.0513 },
  { name: "Cartagena", latitude: 37.6257, longitude: -0.9966 },
  { name: "Santander", latitude: 43.4623, longitude: -3.8099 },
  { name: "San Sebastián", latitude: 43.3183, longitude: -1.9812 },
  { name: "Pamplona", latitude: 42.8125, longitude: -1.6458 },
  { name: "Logroño", latitude: 42.4627, longitude: -2.4449 },
  { name: "Burgos", latitude: 42.3439, longitude: -3.6969 },
  { name: "Salamanca", latitude: 40.9701, longitude: -5.6635 },
  { name: "Toledo", latitude: 39.8628, longitude: -4.0273 },
  { name: "Albacete", latitude: 38.9943, longitude: -1.8585 },
  { name: "Almería", latitude: 36.8340, longitude: -2.4637 },
  { name: "Cádiz", latitude: 36.5271, longitude: -6.2886 },
  { name: "Huelva", latitude: 37.2614, longitude: -6.9447 },
  { name: "Jaén", latitude: 37.7796, longitude: -3.7849 },
  { name: "León", latitude: 42.5987, longitude: -5.5671 },
  { name: "Ourense", latitude: 42.3358, longitude: -7.8639 },
  { name: "Pontevedra", latitude: 42.4336, longitude: -8.6479 },
  { name: "Lugo", latitude: 43.0097, longitude: -7.5568 },
  { name: "Badajoz", latitude: 38.8794, longitude: -6.9707 },
  { name: "Cáceres", latitude: 39.4753, longitude: -6.3724 },
];

const buildCitiesToFetch = ({ userCity, userCoords, radiusKm }) => {
  if (!userCity && !userCoords) return ["Madrid", "Barcelona", "Valencia"];

  const cities = [];
  if (userCity) cities.push(userCity);

  if (userCoords) {
    nearbyCityCatalog
      .map((city) => ({ ...city, distance: distanceKm(userCoords, city) }))
      .filter((city) => city.distance <= radiusKm + 5)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 8)
      .forEach((city) => cities.push(city.name));
  }

  return [...new Set(cities.map((city) => String(city).trim()).filter(Boolean))];
};

const catalunyaAreaHints = [
  "catalunya",
  "cataluña",
  "barcelona",
  "girona",
  "gerona",
  "tarragona",
  "lleida",
  "lerida",
  "lloret",
  "blanes",
  "mataró",
  "mataro",
  "badalona",
  "hospitalet",
  "sabadell",
  "terrassa",
  "reus",
  "figueres",
];

const catalunyaAnchors = [
  { latitude: 41.3874, longitude: 2.1686 },
  { latitude: 41.9794, longitude: 2.8214 },
  { latitude: 41.1189, longitude: 1.2445 },
  { latitude: 41.6176, longitude: 0.6200 },
];

const isNearCatalunyaAgenda = ({ normalizedUserCity, userCoords, radiusKm }) => {
  if (normalizedUserCity && catalunyaAreaHints.some((hint) => normalizedUserCity.includes(hint))) {
    return true;
  }
  if (!userCoords) return false;
  return catalunyaAnchors.some((anchor) => distanceKm(userCoords, anchor) <= radiusKm + 5);
};

const valencianaAreaHints = [
  "comunitat valenciana",
  "comunidad valenciana",
  "valencia",
  "valència",
  "alicante",
  "alacant",
  "castellon",
  "castelló",
  "elche",
  "elx",
  "peñiscola",
  "peniscola",
  "benidorm",
  "gandia",
  "torrevieja",
  "oriola",
  "orihuela",
];

const valencianaAnchors = [
  { latitude: 39.4699, longitude: -0.3763 },
  { latitude: 38.3452, longitude: -0.4810 },
  { latitude: 39.9864, longitude: -0.0513 },
  { latitude: 40.3574, longitude: 0.4069 },
];

const isNearValencianaAgenda = ({ normalizedUserCity, userCoords, radiusKm }) => {
  if (normalizedUserCity && valencianaAreaHints.some((hint) => normalizedUserCity.includes(hint))) {
    return true;
  }
  if (!userCoords) return false;
  return valencianaAnchors.some((anchor) => distanceKm(userCoords, anchor) <= radiusKm + 5);
};

/* ==========================
   EVENTS
   ========================== */

// GET /events  (con / sin userId → favoritos/asistentes + Ticketmaster)
app.get("/events", async (req, res) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const userCity = req.query.city ? String(req.query.city).trim() : null;
    const userLatitude = toNumberOrNull(req.query.latitude ?? req.query.lat);
    const userLongitude = toNumberOrNull(req.query.longitude ?? req.query.lon ?? req.query.lng);
    const requestedRadiusKm = toNumberOrNull(req.query.radius ?? req.query.radiusKm);
    const radiusKm = requestedRadiusKm && requestedRadiusKm > 0 ? requestedRadiusKm : 25;
    const userCoords =
      userLatitude != null && userLongitude != null
        ? { latitude: userLatitude, longitude: userLongitude }
        : null;

    // Fetch local events from database
    let events = [];

    try {
      if (!userId) {
        const { rows } = await pool.query(
          `SELECT e.id, e.title, e.description, e.event_at, e.location, e.type, e.image,
                  e.latitude, e.longitude, e.created_by, e.category_id,
                  ec.slug as category_slug, ec.name as category_name
             FROM events e
             LEFT JOIN event_categories ec ON e.category_id = ec.id
            ORDER BY e.event_at DESC`
        );
        events = rows;
      } else {
        const { rows } = await pool.query(
          `SELECT
              e.*,
              ec.slug as category_slug,
              ec.name as category_name,
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
           LEFT JOIN event_categories ec ON e.category_id = ec.id
           ORDER BY e.event_at DESC`,
          [userId]
        );
        events = rows;
      }
    } catch (dbError) {
      console.warn("⚠️ Database not available, skipping local events:", dbError.message);
      events = []; // Continue with external events only
    }

    // Fetch external events (non-blocking, errors don't crash the response)
    // If the app knows the user's city, only fetch external events for that city.
    // This keeps users in Murcia, Sevilla, Malaga, etc. from receiving Madrid/Barcelona
    // events unless they are actually near those cities and the client asks for them.
    let ticketmasterEvents = [];
    let atrapaloEvents = [];
    let madridOpenDataEvents = [];
    let barcelonaDibaEvents = [];
    let catalunyaAgendaEvents = [];
    let valencianaIvcEvents = [];
    const citiesToFetch = buildCitiesToFetch({ userCity, userCoords, radiusKm });
    console.log("Ciudades externas consultadas:", {
      userCity,
      radiusKm,
      userCoords,
      citiesToFetch,
    });

    const normalizedUserCity = String(userCity || "").trim().toLowerCase();
    const nearMadrid = userCoords
      ? distanceKm(userCoords, { latitude: 40.4168, longitude: -3.7038 }) <= radiusKm + 5
      : false;
    const shouldFetchMadridOpenData = userCity
      ? normalizedUserCity === "madrid" || nearMadrid
      : true;
    const barcelonaAreaHints = [
      "barcelona",
      "badalona",
      "hospitalet",
      "l'hospitalet",
      "sant cugat",
      "terrassa",
      "sabadell",
      "mataró",
      "mataro",
      "sitges",
      "vic",
      "manresa",
      "granollers",
      "castelldefels",
      "cornellà",
      "cornella",
      "gavà",
      "gava",
      "viladecans",
      "sant boi",
      "el prat",
      "barcelonès",
      "maresme",
      "vallès",
      "valles",
      "baix llobregat",
      "garraf",
      "osona",
      "bages",
      "anoia",
      "alt penedès",
      "alt penedes",
    ];
    const shouldFetchBarcelonaDiba = userCity
      ? barcelonaAreaHints.some((hint) => normalizedUserCity.includes(hint))
        || (userCoords
          ? distanceKm(userCoords, { latitude: 41.3874, longitude: 2.1686 }) <= radiusKm + 5
          : false)
      : true;
    const shouldFetchCatalunyaAgenda = userCity || userCoords
      ? isNearCatalunyaAgenda({ normalizedUserCity, userCoords, radiusKm })
      : true;
    const shouldFetchValencianaIvc = userCity || userCoords
      ? isNearValencianaAgenda({ normalizedUserCity, userCoords, radiusKm })
      : true;

    const [
      ticketmasterResult,
      atrapaloResult,
      madridOpenDataResult,
      barcelonaDibaResult,
      catalunyaAgendaResult,
      valencianaIvcResult,
    ] = await Promise.allSettled([
      fetchMusicEventsMultipleCities(citiesToFetch),
      fetchAtrapaloEventsMultipleCities(citiesToFetch),
      shouldFetchMadridOpenData ? fetchMadridOpenDataEvents() : Promise.resolve([]),
      shouldFetchBarcelonaDiba ? fetchBarcelonaDibaEvents() : Promise.resolve([]),
      shouldFetchCatalunyaAgenda ? fetchCatalunyaAgendaEvents() : Promise.resolve([]),
      shouldFetchValencianaIvc ? fetchValencianaIvcEvents() : Promise.resolve([]),
    ]);

    if (ticketmasterResult.status === "fulfilled") {
      ticketmasterEvents = ticketmasterResult.value;
    } else {
      console.warn(
        "Ticketmaster events fetch failed, continuing:",
        ticketmasterResult.reason?.message || ticketmasterResult.reason
      );
    }

    if (atrapaloResult.status === "fulfilled") {
      atrapaloEvents = atrapaloResult.value;
    } else {
      console.warn(
        "Atrápalo events fetch failed, continuing:",
        atrapaloResult.reason?.message || atrapaloResult.reason
      );
    }

    if (madridOpenDataResult.status === "fulfilled") {
      madridOpenDataEvents = madridOpenDataResult.value;
    } else {
      console.warn(
        "Madrid Open Data events fetch failed, continuing:",
        madridOpenDataResult.reason?.message || madridOpenDataResult.reason
      );
    }

    if (barcelonaDibaResult.status === "fulfilled") {
      barcelonaDibaEvents = barcelonaDibaResult.value;
    } else {
      console.warn(
        "Diputació Barcelona events fetch failed, continuing:",
        barcelonaDibaResult.reason?.message || barcelonaDibaResult.reason
      );
    }

    if (catalunyaAgendaResult.status === "fulfilled") {
      catalunyaAgendaEvents = catalunyaAgendaResult.value;
    } else {
      console.warn(
        "Generalitat Catalunya events fetch failed, continuing:",
        catalunyaAgendaResult.reason?.message || catalunyaAgendaResult.reason
      );
    }

    if (valencianaIvcResult.status === "fulfilled") {
      valencianaIvcEvents = valencianaIvcResult.value;
    } else {
      console.warn(
        "Generalitat Valenciana IVC events fetch failed, continuing:",
        valencianaIvcResult.reason?.message || valencianaIvcResult.reason
      );
    }

    // Combine and return events
    const allEvents = [
      ...events,
      ...ticketmasterEvents,
      ...atrapaloEvents,
      ...madridOpenDataEvents,
      ...barcelonaDibaEvents,
      ...catalunyaAgendaEvents,
      ...valencianaIvcEvents,
    ];
    console.log("Eventos devueltos:", {
      local: events.length,
      ticketmaster: ticketmasterEvents.length,
      atrapalo: atrapaloEvents.length,
      madrid_open_data: madridOpenDataEvents.length,
      barcelona_diba: barcelonaDibaEvents.length,
      catalunya_agenda: catalunyaAgendaEvents.length,
      valenciana_ivc: valencianaIvcEvents.length,
      total: allEvents.length,
    });
    if (barcelonaDibaEvents.length) {
      console.log(
        "Diputacio Barcelona muestra:",
        barcelonaDibaEvents.slice(0, 5).map((event) => ({
          title: event.title,
          city: event.city,
          date: event.date,
          category_slug: event.category_slug,
          latitude: event.latitude,
          longitude: event.longitude,
        }))
      );
    }
    return res.json(allEvents);
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
    
    // Look up category_id from type slug
    let categoryId = null;
    if (type) {
      const catResult = await pool.query(
        `SELECT id FROM event_categories WHERE slug = $1`,
        [String(type).toLowerCase()]
      );
      if (catResult.rows.length > 0) {
        categoryId = catResult.rows[0].id;
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO events (title, description, event_at, location, type, category_id, image, latitude, longitude, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, title, description, event_at, location, type, category_id, image, latitude, longitude, created_by`,
      [
        title,
        description,
        event_at,
        location,
        type,
        categoryId,
        image,
        latitude,
        longitude,
        createdByInt,
      ]
    );

    const row = rows[0];

    // Join with event_categories to get category info
    if (row && row.category_id) {
      const catResult = await pool.query(
        `SELECT slug, name FROM event_categories WHERE id = $1`,
        [row.category_id]
      );
      if (catResult.rows.length > 0) {
        row.category_slug = catResult.rows[0].slug;
        row.category_name = catResult.rows[0].name;
      }
    }

    if (row?.created_by) {
      const u = await pool.query(`SELECT name FROM users WHERE id=$1`, [
        row.created_by,
      ]);
      row.created_by_name = u.rows[0]?.name || null;
    } else {
      row.created_by_name = null;
    }

    res.status(201).json(row);
  } catch (e) {
    console.error("PG ERROR:", e.message, e.detail, e.hint);
    res
      .status(500)
      .json({ error: "Error creando evento", detail: e.message });
  }
});

// DELETE /events/:eventId
app.delete("/events/:eventId", async (req, res) => {
  const eventId = req.eventId;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM event_attendees WHERE event_id = $1`, [
      eventId,
    ]);
    await client.query(`DELETE FROM event_favorites WHERE event_id = $1`, [
      eventId,
    ]);
    await client.query(`DELETE FROM event_comments  WHERE event_id = $1`, [
      eventId,
    ]);
    await client.query(`DELETE FROM api_events      WHERE event_id = $1`, [
      eventId,
    ]);

    const del = await client.query(
      `DELETE FROM events WHERE id = $1 RETURNING id`,
      [eventId]
    );

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

  // If type is being updated, also look up and update category_id
  let categoryId = null;
  if (typeof type !== "undefined" && type) {
    const catResult = await pool.query(
      `SELECT id FROM event_categories WHERE slug = $1`,
      [String(type).toLowerCase()]
    );
    if (catResult.rows.length > 0) {
      categoryId = catResult.rows[0].id;
      set.push(`category_id = $${i++}`);
      values.push(categoryId);
    }
  }

  values.push(eventId);

  try {
    const { rows } = await pool.query(
      `
      UPDATE events
         SET ${set.join(", ")}
       WHERE id = $${i}
       RETURNING id, title, description, event_at, location, type, category_id, image, latitude, longitude, created_by
      `,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Evento no encontrado" });
    }

    const row = rows[0];

    // Join with event_categories to get category info
    if (row && row.category_id) {
      const catResult = await pool.query(
        `SELECT slug, name FROM event_categories WHERE id = $1`,
        [row.category_id]
      );
      if (catResult.rows.length > 0) {
        row.category_slug = catResult.rows[0].slug;
        row.category_name = catResult.rows[0].name;
      }
    }

    res.json(row);
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
    const safePath = oldImagePath.replace(/^\//, "");
    const fullPath = path.join(process.cwd(), safePath);
    fs.unlink(fullPath, (err) => {
      if (err) {
        console.warn(
          "No se pudo borrar la imagen anterior:",
          fullPath,
          err.message
        );
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
  if (!rows.length)
    return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(rows[0]);
});

const updateProfileHandler = async (req, res) => {
  const { userId } = req.params;
  const { name, email } = req.body;

  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim().toLowerCase();

  if (!trimmedName) return res.status(400).json({ error: "Nombre requerido" });
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return res.status(400).json({ error: "Email inválido" });
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE email = $1 AND id <> $2",
    [trimmedEmail, userId]
  );

  if (existing.rows.length) {
    return res.status(409).json({ message: "Email en uso" });
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET name = $1, email = $2
     WHERE id = $3
     RETURNING id, name, email, photo`,
    [trimmedName, trimmedEmail, userId]
  );

  if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(rows[0]);
};

// Actualizar datos del usuario
app.put("/users/:userId", updateProfileHandler);
app.put("/users/:userId/profile", updateProfileHandler);

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

/* ==========================
   FRIEND REQUESTS (SOLICITUDES DE AMISTAD)
   ========================== */

// Enviar solicitud de amistad
app.post("/friend-requests", async (req, res) => {
  try {
    const { senderId, receiverId } = req.body;

    if (!senderId || !receiverId || senderId === receiverId) {
      return res.status(400).json({ error: "senderId/receiverId inválidos" });
    }

    await pool.query(
      `INSERT INTO friend_requests (sender_id, receiver_id)
       VALUES ($1, $2)
       ON CONFLICT (sender_id, receiver_id) DO NOTHING`,
      [senderId, receiverId]
    );

    console.log("[friend-requests] solicitud creada", { senderId, receiverId });
    return res.json({ success: true });
  } catch (e) {
    console.error("POST /friend-requests ERROR:", e);
    return res.status(500).json({ error: "Error creando solicitud" });
  }
});

// Listar solicitudes recibidas por un usuario
app.get("/users/:userId/friend-requests", async (req, res) => {
  const { userId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT fr.id,
              fr.sender_id,
              fr.receiver_id,
              fr.created_at,
              u.name,
              u.email,
              u.photo
         FROM friend_requests fr
         JOIN users u ON u.id = fr.sender_id
        WHERE fr.receiver_id = $1
        ORDER BY fr.created_at DESC`,
      [userId]
    );
    return res.json(rows);
  } catch (e) {
    console.error("GET /users/:userId/friend-requests ERROR:", e);
    return res.status(500).json({ error: "Error listando solicitudes" });
  }
});

// Aceptar solicitud (crea amistad en ambos sentidos y borra la solicitud)
app.post("/friend-requests/:requestId/accept", async (req, res) => {
  const { requestId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT sender_id, receiver_id
         FROM friend_requests
        WHERE id = $1`,
      [requestId]
    );

    if (!rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    const { sender_id, receiver_id } = rows[0];

    await client.query(
      `INSERT INTO friends (user_id, friend_id)
       VALUES ($1, $2), ($2, $1)
       ON CONFLICT DO NOTHING`,
      [sender_id, receiver_id]
    );

    await client.query(`DELETE FROM friend_requests WHERE id = $1`, [requestId]);

    await client.query("COMMIT");
    console.log("[friend-requests] aceptada", { requestId, sender_id, receiver_id });
    return res.json({ success: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("POST /friend-requests/:requestId/accept ERROR:", e);
    return res.status(500).json({ error: "Error aceptando solicitud" });
  } finally {
    client.release();
  }
});

// Rechazar / eliminar solicitud
app.delete("/friend-requests/:requestId", async (req, res) => {
  const { requestId } = req.params;
  try {
    await pool.query(`DELETE FROM friend_requests WHERE id = $1`, [requestId]);
    console.log("[friend-requests] eliminada", { requestId });
    return res.json({ success: true });
  } catch (e) {
    console.error("DELETE /friend-requests/:requestId ERROR:", e);
    return res.status(500).json({ error: "Error borrando solicitud" });
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
    const { rows } = await pool.query("SELECT * FROM favorites WHERE event_id = $1", [
      id,
    ]);
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
  const { eventId } = req.params; // ✅ CORREGIDO

  try {
    const { rows } = await pool.query(
      `SELECT 
         u.id,
         u.name,
         u.photo
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
  const { eventId } = req.params; // ✅ CORREGIDO
  const { userId } = req.params;

  try {
    const r = await pool.query(
      `SELECT 1
         FROM event_attendees
        WHERE event_id = $1 AND user_id = $2`,
      [eventId, userId]
    );
    res.json({ attending: r.rowCount > 0 });
  } catch (e) {
    console.error("Error checking attending:", e);
    res.status(500).json({ error: "Error checking attending" });
  }
});

/* ==========================
   COMENTARIOS
   ========================== */

app.get("/events/:eventId/comments", async (req, res) => {
  const eventId = req.eventId;
  const { rows } = await pool.query(
    `SELECT ec.id, ec.comment, ec.created_at, u.id AS user_id, u.name, u.photo
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
app.delete("/events/:eventId/comments/:commentId", async (req, res) => {
  const eventId = req.params.eventId;
  const commentId = req.params.commentId;

  // Sin JWT: userId por query o body
  const userId = req.query.userId || req.body?.userId;
  if (!userId) return res.status(401).json({ error: "userId requerido" });

  try {
    // ✅ Solo borra si el comentario pertenece a ese usuario
    const result = await pool.query(
      `DELETE FROM event_comments
       WHERE id = $1 AND event_id = $2 AND user_id = $3
       RETURNING id`,
      [commentId, eventId, userId]
    );

    if (result.rowCount === 0) {
      // puede ser que no exista o no sea tuyo (no damos detalles)
      return res.status(403).json({ error: "No autorizado o no existe" });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE comment error:", e);
    res.status(500).json({ error: "Error borrando comentario" });
  }
});

/* ==========================
   AUTH HELPERS
   ========================== */

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
}

async function sendVerificationEmail(email, code, purpose) {
  const subject = purpose === 'register' ? 'Código de verificación para registro' : 'Código de verificación para inicio de sesión';
  const html = `
    <h2>${subject}</h2>
    <p>Tu código de verificación es: <strong>${code}</strong></p>
    <p>Este código expira en 10 minutos.</p>
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject,
      html,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

async function createVerificationCode(email, purpose) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await pool.query(
    'INSERT INTO verification_codes (email, code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
    [email, code, purpose, expiresAt]
  );

  return code;
}

async function verifyCode(email, code, purpose) {
  const result = await pool.query(
    'SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND purpose = $3 AND used = FALSE AND expires_at > NOW()',
    [email, code, purpose]
  );

  if (result.rowCount === 0) return null;

  // Mark as used
  await pool.query(
    'UPDATE verification_codes SET used = TRUE WHERE id = $1',
    [result.rows[0].id]
  );

  return result.rows[0];
}

/* ==========================
   AUTH (registro / login)
   ========================== */

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_super_largo_cámbialo";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

/** ✅ FIX: Middleware JWT para rutas protegidas (mínimo, no toca nada más) */
function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) return res.status(401).json({ message: "No token provided" });

    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, iat, exp }
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid/expired token" });
  }
}

app.post("/auth/register", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const { privacyAccepted } = req.body;

    if (!name || !email)
      return res.status(400).json({ message: "Nombre y email obligatorios" });

    if (privacyAccepted !== true) {
      return res.status(400).json({
        message: "Debes aceptar la política de privacidad",
      });
    }

    const exists = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [
      email,
    ]);

    if (exists.rowCount > 0)
      return res.status(409).json({ message: "El email ya está registrado" });

    const code = await createVerificationCode(email, "register");
    await sendVerificationEmail(email, code, "register");

    res.json({ message: "Código enviado a tu email" });
  } catch (e) {
    console.error("REGISTER ERROR:", e);
    res.status(500).json({ message: "Error enviando código" });
  }
});

app.post("/auth/verify-register", async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const code = req.body.code?.trim();
    const name = req.body.name?.trim();
    const { privacyAccepted } = req.body;

    if (!email || !code || !name)
      return res.status(400).json({ message: "Campos obligatorios" });

    if (privacyAccepted !== true) {
      return res.status(400).json({
        message: "Debes aceptar la política de privacidad",
      });
    }

    const verification = await verifyCode(email, code, "register");

    if (!verification) {
      return res.status(400).json({ message: "Código inválido o expirado" });
    }

    const PRIVACY_VERSION = "1.0";

    const result = await pool.query(
      `INSERT INTO users (
         name, email,
         privacy_accepted_at, privacy_version
       )
       VALUES ($1, $2, NOW(), $3)
       RETURNING id, name, email, privacy_accepted_at, privacy_version`,
      [name, email, PRIVACY_VERSION]
    );

    const user = result.rows[0];
    const token = signToken({ id: user.id, email: user.email });

    res.json({ user, token });
  } catch (e) {
    console.error("VERIFY REGISTER ERROR:", e);
    res.status(500).json({ message: "Error verificando registro" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ message: "Email requerido" });

    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rowCount === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    const code = await createVerificationCode(email, 'login');
    await sendVerificationEmail(email, code, 'login');

    res.json({ message: "Código enviado a tu email" });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    res.status(500).json({ message: "Error enviando código" });
  }
});

app.post("/auth/verify-login", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code)
      return res.status(400).json({ message: "Email y código requeridos" });

    const verification = await verifyCode(email, code, 'login');
    if (!verification) {
      return res.status(400).json({ message: "Código inválido o expirado" });
    }

    const result = await pool.query(
      "SELECT id, name, email FROM users WHERE email = $1",
      [email]
    );
    if (result.rowCount === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    const user = result.rows[0];
    const token = signToken({ id: user.id, email: user.email });
    res.json({ user, token });
  } catch (e) {
    console.error("VERIFY LOGIN ERROR:", e);
    res.status(500).json({ message: "Error verificando login" });
  }
});

app.delete("/users/me", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE USER ERROR:", e);
    res.status(500).json({ message: "Error eliminando la cuenta" });
  }
});


/* ==========================
   START SERVER
   ========================== */

void warmAtrapaloCache();
void warmMadridOpenDataCache();
void warmBarcelonaDibaCache();
void warmCatalunyaAgendaCache();
void warmValencianaIvcCache();

app.listen(PORT, () => {
  console.log(`✅ API escuchando en puerto ${PORT}`);
});
