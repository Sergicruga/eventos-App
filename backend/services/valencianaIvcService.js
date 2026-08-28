import { categoryFromText } from "./categoryUtils.js";

const IVC_EVENTS_URL =
  "https://dadesobertes.gva.es/dataset/25cc4d21-e1dd-4d05-b057-dbcc44d4338c/resource/15084e00-c416-4b4d-b229-7a06f4bf07b0/download/lista-de-actividades-culturales-programadas-por-el-ivc.json";

const CACHE_TTL_MS = Number(process.env.VALENCIANA_IVC_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.VALENCIANA_IVC_MAX_EVENTS || 180);

let cache = { events: [], updatedAt: 0 };
let pending = null;

const stripHtml = (value = "") =>
  String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const parseNumber = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const parseTime = (value) => {
  const raw = String(value || "");
  const match = raw.match(/(\d{1,2})(?:[:.]\s?|\s*h\s*)(\d{2})?/i);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${(match[2] || "00").padStart(2, "0")}`;
};

const normalizeIvcRows = (data) => {
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const events = [];
  let current = null;

  for (const row of rows) {
    const entries = Object.entries(row || {});
    if (!entries.length) continue;
    const [key, value] = entries[0];

    if (key === "titulo_evento") {
      if (current) events.push(current);
      current = {};
    }

    if (!current) current = {};
    current[key] = value;
  }

  if (current) events.push(current);
  return events;
};

const formatValencianaIvcEvent = (item) => {
  const title = stripHtml(item.titulo_evento || item.title || item.name);
  const startDate = parseDate(item.fecha_inicio || item.startDate || item.date);
  const endDate = parseDate(item.fecha_fin || item.endDate);
  if (!title || !startDate) return null;

  const today = new Date().toISOString().slice(0, 10);
  const date = startDate >= today ? startDate : endDate && endDate >= today ? today : startDate;
  const timeStart = parseTime(item.hora);
  const city = stripHtml(item.municipio || item.localidad || item.city || "");
  const venue = stripHtml(item.lugar_evento || item.venue || "");
  const address = stripHtml(item.direccion || item.address || "");
  const url = item.web ? String(item.web).trim() : null;
  const category = categoryFromText(title, item.tipo_evento);
  const externalKey = [
    title,
    startDate,
    city,
    venue,
  ]
    .map((part) => normalizeText(part).replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean)
    .join("_")
    .slice(0, 180);

  return {
    id: `ivc_${externalKey}`,
    externalId: `ivc_${externalKey}`,
    title,
    description: stripHtml(item.tipo_evento || ""),
    date,
    endDate,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location: [venue, address, city].filter(Boolean).join(", ") || city || "Comunitat Valenciana",
    city: city || null,
    latitude: parseNumber(item.latitud),
    longitude: parseNumber(item.longitud),
    image: null,
    images: [],
    type: "api",
    source: "valenciana_ivc",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
    price: /grat/i.test(String(item.precio || "")) ? 0 : null,
    currency: "EUR",
  };
};

async function refreshValencianaIvcEvents() {
  const response = await fetch(IVC_EVENTS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Generalitat Valenciana IVC HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawEvents = normalizeIvcRows(data);
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const events = [];

  for (const item of rawEvents) {
    const event = formatValencianaIvcEvent(item);
    if (!event || event.date < today || seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }

  cache = { events, updatedAt: Date.now() };
  console.log(`Generalitat Valenciana IVC: ${events.length} eventos actualizados`);
  return events;
}

async function fetchValencianaIvcEvents() {
  if (process.env.DISABLE_VALENCIANA_IVC === "true") return [];

  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  if (pending) return pending;

  pending = refreshValencianaIvcEvents()
    .catch((error) => {
      console.warn("Generalitat Valenciana IVC no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function warmValencianaIvcCache() {
  if (process.env.DISABLE_VALENCIANA_IVC === "true") return;
  await fetchValencianaIvcEvents();
}

export {
  fetchValencianaIvcEvents,
  formatValencianaIvcEvent,
  warmValencianaIvcCache,
};
