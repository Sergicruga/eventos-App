import { categoryFromText } from "./categoryUtils.js";

const CATALUNYA_AGENDA_URL =
  "https://analisi.transparenciacatalunya.cat/resource/rhpv-yr4f.json";

const CACHE_TTL_MS = Number(process.env.CATALUNYA_AGENDA_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.CATALUNYA_AGENDA_MAX_EVENTS || 300);
const FETCH_LIMIT = Number(process.env.CATALUNYA_AGENDA_FETCH_LIMIT || 1000);

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

const absoluteUrl = (url) => {
  if (!url) return null;
  try {
    return new URL(String(url), "https://agenda.cultura.gencat.cat").href;
  } catch {
    return null;
  }
};

const parseDate = (value) => {
  if (!value) return null;
  const raw = String(value);
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

const parseNumber = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const titleCase = (value = "") =>
  String(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const locationNameFromSlug = (value) => {
  if (!value) return "";
  const raw = String(value);
  const last = raw.split("/").filter(Boolean).pop() || raw;
  return titleCase(last.replace(/-/g, " "));
};

const firstImageUrl = (item) => {
  const candidates = [
    item.imgapp,
    ...(String(item.imatges || "")
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean)),
    item.destacada_imatge,
  ];

  return absoluteUrl(candidates.find(Boolean));
};

const formatCatalunyaAgendaEvent = (item) => {
  const id = item.codi || item.id;
  const title = stripHtml(item.denominaci || item.titol || item.title || item.name);
  const startDate = parseDate(item.data_inici || item.startDate || item.date);
  const endDate = parseDate(item.data_fi || item.endDate || item.end_date);
  const today = new Date().toISOString().slice(0, 10);
  const date = startDate && startDate >= today ? startDate : endDate && endDate >= today ? today : startDate;
  if (!id || !title || !date) return null;

  const description = stripHtml(item.descripcio_html || item.descripcio || item.description || "");
  const city = stripHtml(
    item.localitat ||
      locationNameFromSlug(item.municipi || item.comarca_i_municipi) ||
      item.city ||
      "",
  );
  const venue = stripHtml(item.espai || item.venue || "");
  const address = stripHtml(item.adre_a || item.adreca || item.address || "");
  const location = [venue, address, city].filter(Boolean).join(", ");
  const latitude = parseNumber(item.latitud || item.latitude);
  const longitude = parseNumber(item.longitud || item.longitude);
  const image = firstImageUrl(item);
  const url = absoluteUrl(item.linkbotoentrades || item.url || item.enlla_os);
  const timeStart = parseTime(item.horari || item.data_inici);
  const category = categoryFromText(
    title,
    description,
    item.tags_mbits,
    item.tags_categor_es,
    item.modalitat,
  );

  return {
    id: `gencat_${id}`,
    externalId: `gencat_${id}`,
    title,
    description,
    date,
    endDate,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location: location || city || "Catalunya",
    city: city || null,
    latitude,
    longitude,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "catalunya_agenda",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    subcategory_slug: category.subcategory_slug || null,
    subcategory_name: category.subcategory_name || null,
    genre: category.name,
    price: String(item.gratuita || "").toLowerCase() === "si" ? 0 : null,
    currency: "EUR",
  };
};

async function refreshCatalunyaAgendaEvents() {
  const url = new URL(CATALUNYA_AGENDA_URL);
  const today = new Date().toISOString().slice(0, 10);
  url.searchParams.set("$limit", String(FETCH_LIMIT));
  url.searchParams.set("$order", "data_inici ASC");
  url.searchParams.set(
    "$where",
    `data_fi >= '${today}T00:00:00' OR data_inici >= '${today}T00:00:00'`,
  );

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Generalitat Catalunya HTTP ${response.status}`);
  }

  const rawEvents = await response.json();
  const seen = new Set();
  const events = [];

  for (const item of Array.isArray(rawEvents) ? rawEvents : []) {
    const event = formatCatalunyaAgendaEvent(item);
    if (!event || event.date < today || seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }

  cache = { events, updatedAt: Date.now() };
  const byCity = events.reduce((acc, event) => {
    const city = event.city || "sin_ciudad";
    acc[city] = (acc[city] || 0) + 1;
    return acc;
  }, {});
  console.log(`Generalitat Catalunya: ${events.length} eventos actualizados`);
  console.log("Generalitat Catalunya ciudades:", byCity);
  return events;
}

async function fetchCatalunyaAgendaEvents() {
  if (process.env.DISABLE_CATALUNYA_AGENDA === "true") return [];

  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  if (pending) return pending;

  pending = refreshCatalunyaAgendaEvents()
    .catch((error) => {
      console.warn("Generalitat Catalunya no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function warmCatalunyaAgendaCache() {
  if (process.env.DISABLE_CATALUNYA_AGENDA === "true") return;
  await fetchCatalunyaAgendaEvents();
}

export {
  fetchCatalunyaAgendaEvents,
  formatCatalunyaAgendaEvent,
  warmCatalunyaAgendaCache,
};

