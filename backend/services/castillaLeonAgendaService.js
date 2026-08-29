import { categoryFromText } from "./categoryUtils.js";

const CASTILLA_LEON_EVENTS_URL =
  "https://datosabiertos.jcyl.es/web/jcyl/risp/es/cultura-ocio/agenda_cultural/1284806871500.json";
const CACHE_TTL_MS = Number(process.env.CASTILLA_LEON_AGENDA_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.CASTILLA_LEON_AGENDA_MAX_EVENTS || 220);

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

const parseDate = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const parseTime = (value) => {
  const match = String(value || "").match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const cleanImageUrl = (value) => {
  if (!value) return null;
  return String(value).replace(/&amp;/g, "&").trim();
};

const formatCastillaLeonEvent = (item) => {
  const id = item.id_evento || item.enlace_contenido || item.titulo;
  const title = stripHtml(item.titulo || "");
  const date = parseDate(item.fecha_inicio);
  if (!id || !title || !date) return null;

  const description = stripHtml(item.descripcion || "");
  const city = item.nombre_localidad || item.nombre_provincia || "Castilla y León";
  const venue = item.lugar_celebracion || "";
  const latitude = Number(item.latitud ?? item.posicion?.lat);
  const longitude = Number(item.longitud ?? item.posicion?.lon);
  const timeStart = parseTime(item.hora_inicio);
  const image = cleanImageUrl(item.imagen_evento_ampliada || item.imagen_evento);
  const category = categoryFromText(
    title,
    description,
    item.categoria,
    item.tematica,
    item.destinatarios
  );
  const url = item.enlace_contenido || null;

  return {
    id: `castilla_leon_${id}`,
    externalId: `castilla_leon_${id}`,
    title,
    description,
    date,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location: [venue, city, item.nombre_provincia].filter(Boolean).join(", "),
    city,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "castilla_leon_agenda",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
  };
};

async function refreshEvents() {
  if (pending) return pending;

  pending = (async () => {
    const response = await fetch(CASTILLA_LEON_EVENTS_URL, {
      headers: { Accept: "application/json", "User-Agent": "GoPlan/1.0" },
    });

    if (!response.ok) throw new Error(`Castilla y León Agenda HTTP ${response.status}`);

    const data = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    const events = (Array.isArray(data) ? data : [])
      .map(formatCastillaLeonEvent)
      .filter((event) => event && event.date >= today)
      .slice(0, MAX_EVENTS);

    cache = { events, updatedAt: Date.now() };
    console.log(`Castilla y León Agenda: ${events.length} eventos actualizados`);
    return events;
  })()
    .catch((error) => {
      console.warn("Castilla y León Agenda no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function fetchCastillaLeonAgendaEvents() {
  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) return cache.events;
  return refreshEvents();
}

async function warmCastillaLeonAgendaCache() {
  try {
    await refreshEvents();
  } catch {}
}

export { fetchCastillaLeonAgendaEvents, warmCastillaLeonAgendaCache };
