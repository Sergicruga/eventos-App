import { categoryFromText } from "./categoryUtils.js";

const GIJON_EVENTS_URL = "https://opendata.gijon.es/descargar.php?id=728&tipo=JSON";
const CACHE_TTL_MS = Number(process.env.GIJON_AGENDA_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.GIJON_AGENDA_MAX_EVENTS || 160);

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
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const parseTime = (value) => {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const formatGijonEvent = (item) => {
  const id = item.id || item.alias || item.titulo;
  const title = stripHtml(item.titulo || "");
  const date = parseDate(item.fecha_inicio || item.fechas);
  if (!id || !title || !date) return null;

  const venue =
    stripHtml(item.titulo_directorio || item.field_lo_name || item.localizaciones || "") ||
    "Gijón/Xixón";
  const description = stripHtml(
    [
      item.materia,
      item.tipo,
      item.etiquetas,
      item.field_area,
      item.programa,
      item.tipo_publico,
    ]
      .filter(Boolean)
      .join(". ")
  );
  const image = String(item.imagen || "").trim() || null;
  const url = item.alias || null;
  const category = categoryFromText(
    title,
    description,
    item.materia,
    item.tipo,
    item.etiquetas
  );

  return {
    id: `gijon_${id}`,
    externalId: `gijon_${id}`,
    title,
    description,
    date,
    timeStart: parseTime(item.hora_inicio),
    startsAt: `${date}T${parseTime(item.hora_inicio)}:00`,
    location: [venue, "Gijón"].filter(Boolean).join(", "),
    city: "Gijón",
    latitude: 43.5322,
    longitude: -5.6611,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "gijon_agenda",
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
    const response = await fetch(GIJON_EVENTS_URL, {
      headers: { Accept: "application/json", "User-Agent": "GoPlan/1.0" },
    });

    if (!response.ok) throw new Error(`Gijón Agenda HTTP ${response.status}`);

    const data = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    const events = (Array.isArray(data) ? data : [])
      .map(formatGijonEvent)
      .filter((event) => event && event.date >= today)
      .slice(0, MAX_EVENTS);

    cache = { events, updatedAt: Date.now() };
    console.log(`Gijón Agenda: ${events.length} eventos actualizados`);
    return events;
  })()
    .catch((error) => {
      console.warn("Gijón Agenda no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function fetchGijonAgendaEvents() {
  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) return cache.events;
  return refreshEvents();
}

async function warmGijonAgendaCache() {
  try {
    await refreshEvents();
  } catch {}
}

export { fetchGijonAgendaEvents, warmGijonAgendaCache };
