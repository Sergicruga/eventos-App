import { categoryFromText } from "./categoryUtils.js";

const DIBA_EVENT_URLS = [
  "https://do.diba.cat/api/dataset/actesturisme_es/format/json",
  "http://do.diba.cat/api/dataset/actesturisme_es/format/json",
];

const CACHE_TTL_MS = Number(process.env.BARCELONA_DIBA_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.BARCELONA_DIBA_MAX_EVENTS || 180);

let cache = { events: [], updatedAt: 0 };
let pending = null;

const MUNICIPALITY_COORDS = {
  "barcelona": { latitude: 41.3874, longitude: 2.1686 },
  "badalona": { latitude: 41.4500, longitude: 2.2474 },
  "l'hospitalet de llobregat": { latitude: 41.3596, longitude: 2.0997 },
  "hospitalet de llobregat": { latitude: 41.3596, longitude: 2.0997 },
  "santa coloma de gramenet": { latitude: 41.4446, longitude: 2.2103 },
  "sant adrià de besòs": { latitude: 41.4306, longitude: 2.2182 },
  "sant adria de besos": { latitude: 41.4306, longitude: 2.2182 },
  "sant cugat del vallès": { latitude: 41.4706, longitude: 2.0851 },
  "sant cugat del valles": { latitude: 41.4706, longitude: 2.0851 },
  "terrassa": { latitude: 41.5632, longitude: 2.0089 },
  "sabadell": { latitude: 41.5463, longitude: 2.1086 },
  "mataró": { latitude: 41.5381, longitude: 2.4445 },
  "mataro": { latitude: 41.5381, longitude: 2.4445 },
  "sitges": { latitude: 41.2372, longitude: 1.8059 },
  "vic": { latitude: 41.9301, longitude: 2.2549 },
  "manresa": { latitude: 41.7282, longitude: 1.8230 },
  "granollers": { latitude: 41.6079, longitude: 2.2877 },
  "castelldefels": { latitude: 41.2800, longitude: 1.9766 },
  "cornellà de llobregat": { latitude: 41.3556, longitude: 2.0708 },
  "cornella de llobregat": { latitude: 41.3556, longitude: 2.0708 },
  "gavà": { latitude: 41.3061, longitude: 2.0012 },
  "gava": { latitude: 41.3061, longitude: 2.0012 },
  "viladecans": { latitude: 41.3167, longitude: 2.0198 },
  "sant boi de llobregat": { latitude: 41.3475, longitude: 2.0436 },
  "el prat de llobregat": { latitude: 41.3275, longitude: 2.0947 },
};

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

const absoluteUrl = (url) => {
  if (!url) return null;
  try {
    return new URL(String(url), "https://www.barcelonaesmoltmes.cat").href;
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
  const match = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const parseCoordinates = (value) => {
  if (!value) return { latitude: null, longitude: null };

  if (typeof value === "object") {
    const latitude = value.lat || value.latitude || value.y || null;
    const longitude = value.lon || value.lng || value.longitude || value.x || null;
    return {
      latitude: latitude != null ? Number(latitude) : null,
      longitude: longitude != null ? Number(longitude) : null,
    };
  }

  const match = String(value).match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return { latitude: null, longitude: null };

  return {
    latitude: Number(match[1]),
    longitude: Number(match[2]),
  };
};

const municipalityCoordinates = (municipality) =>
  MUNICIPALITY_COORDS[normalizeText(municipality)] || {
    latitude: null,
    longitude: null,
  };

const firstArray = (...values) => values.find(Array.isArray) || [];

const extractItems = (data) =>
  firstArray(
    data,
    data?.elements,
    data?.items,
    data?.data,
    data?.result,
    data?.records,
    data?.dataset?.elements,
    data?.dataset?.items,
    data?.dataset?.data,
    data?.dades,
    data?.registre,
    data?.registres,
  );

const fieldValue = (item, ...keys) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value == null) continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested =
        value.value ??
        value.raw ??
        value.text ??
        value.title ??
        value.name ??
        value.url ??
        value.uri ??
        null;
      if (nested != null && String(nested).trim() !== "") return nested;
      continue;
    }
    if (String(value).trim() !== "") return value;
  }
  return null;
};

const formatDibaEvent = (item) => {
  const id = fieldValue(item, "acte_id", "id", "id_secundari");
  const title = stripHtml(fieldValue(item, "titol", "title", "name"));
  const date = parseDate(fieldValue(item, "data_inici", "date", "startDate"));
  if (!id || !title || !date) return null;

  const description = stripHtml(fieldValue(item, "descripcio", "cos", "description") || "");
  const municipality = stripHtml(fieldValue(item, "municipi_nom", "municipi", "city") || "Barcelona");
  const venue = stripHtml(fieldValue(item, "adreca_nom", "venue") || "");
  const address = stripHtml(fieldValue(item, "adreca", "address") || "");
  const location = [venue, address, municipality].filter(Boolean).join(", ");
  const coordinates = parseCoordinates(fieldValue(item, "localitzacio", "location"));
  const fallbackCoordinates =
    coordinates.latitude != null && coordinates.longitude != null
      ? coordinates
      : municipalityCoordinates(municipality);
  const category = categoryFromText(
    title,
    description,
    fieldValue(item, "categoria"),
    fieldValue(item, "tags"),
    fieldValue(item, "rel_temes"),
    fieldValue(item, "tipus"),
  );
  const image = absoluteUrl(fieldValue(item, "imatge", "image"));
  const url = absoluteUrl(fieldValue(item, "acte_url", "url_general", "url", "documentacio"));
  const timeStart = parseTime(
    fieldValue(item, "observacions_horari", "dies", "data_inici"),
  );

  return {
    id: `diba_${id}`,
    externalId: `diba_${id}`,
    title,
    description,
    date,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location: location || municipality,
    city: municipality,
    latitude: fallbackCoordinates.latitude,
    longitude: fallbackCoordinates.longitude,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "barcelona_diba",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
    price: /gratu/i.test(String(fieldValue(item, "preu") || "")) ? 0 : null,
    currency: "EUR",
  };
};

async function fetchDibaJson() {
  let lastError = null;

  for (const url of DIBA_EVENT_URLS) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      console.log(`Diputacio Barcelona: usando ${url}`);
      return response.json();
    } catch (error) {
      lastError = error;
      console.warn(`Diputacio Barcelona no disponible en ${url}:`, error.message);
    }
  }

  throw lastError || new Error("No se pudo consultar Diputacio Barcelona");
}

async function refreshBarcelonaDibaEvents() {
  const data = await fetchDibaJson();
  const rawEvents = extractItems(data);
  console.log(`Diputacio Barcelona: ${rawEvents.length} registros recibidos`);

  const seen = new Set();
  const events = [];

  for (const item of rawEvents) {
    const event = formatDibaEvent(item);
    if (!event || seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }

  cache = { events, updatedAt: Date.now() };
  const categories = events.reduce((acc, event) => {
    const slug = event.category_slug || "sin_categoria";
    acc[slug] = (acc[slug] || 0) + 1;
    return acc;
  }, {});
  console.log(`Diputacio Barcelona: ${events.length} eventos actualizados`);
  console.log("Diputacio Barcelona categorias:", categories);
  return events;
}

async function fetchBarcelonaDibaEvents() {
  if (process.env.DISABLE_BARCELONA_DIBA === "true") return [];

  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  if (pending) return pending;

  pending = refreshBarcelonaDibaEvents()
    .catch((error) => {
      console.warn("Diputacio Barcelona no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function warmBarcelonaDibaCache() {
  if (process.env.DISABLE_BARCELONA_DIBA === "true") return;
  await fetchBarcelonaDibaEvents();
}

export {
  fetchBarcelonaDibaEvents,
  formatDibaEvent,
  warmBarcelonaDibaCache,
};
