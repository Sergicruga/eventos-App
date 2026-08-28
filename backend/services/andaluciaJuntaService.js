import { categoryFromText } from "./categoryUtils.js";

const ANDALUCIA_EVENTS_URL =
  "https://datos.juntadeandalucia.es/api/v0/schedule/all?format=json";

const CACHE_TTL_MS = Number(process.env.ANDALUCIA_JUNTA_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.ANDALUCIA_JUNTA_MAX_EVENTS || 160);

let cache = { events: [], updatedAt: 0 };
let pending = null;

const ANDALUCIA_COORDS = {
  "sevilla": { latitude: 37.3891, longitude: -5.9845 },
  "málaga": { latitude: 36.7213, longitude: -4.4214 },
  "malaga": { latitude: 36.7213, longitude: -4.4214 },
  "granada": { latitude: 37.1773, longitude: -3.5986 },
  "córdoba": { latitude: 37.8882, longitude: -4.7794 },
  "cordoba": { latitude: 37.8882, longitude: -4.7794 },
  "cádiz": { latitude: 36.5271, longitude: -6.2886 },
  "cadiz": { latitude: 36.5271, longitude: -6.2886 },
  "huelva": { latitude: 37.2614, longitude: -6.9447 },
  "jaén": { latitude: 37.7796, longitude: -3.7849 },
  "jaen": { latitude: 37.7796, longitude: -3.7849 },
  "almería": { latitude: 36.8340, longitude: -2.4637 },
  "almeria": { latitude: 36.8340, longitude: -2.4637 },
  "jerez de la frontera": { latitude: 36.6850, longitude: -6.1261 },
  "marbella": { latitude: 36.5101, longitude: -4.8824 },
  "dos hermanas": { latitude: 37.2866, longitude: -5.9242 },
  "algeciras": { latitude: 36.1408, longitude: -5.4562 },
  "san fernando": { latitude: 36.4652, longitude: -6.1983 },
  "el puerto de santa maría": { latitude: 36.5939, longitude: -6.2320 },
  "puerto de santa maría": { latitude: 36.5939, longitude: -6.2320 },
  "puerto de santa maria": { latitude: 36.5939, longitude: -6.2320 },
  "cazorla": { latitude: 37.9140, longitude: -3.0034 },
  "aguilar de la frontera": { latitude: 37.5148, longitude: -4.6567 },
  "cambil": { latitude: 37.6798, longitude: -3.5654 },
  "ronda": { latitude: 36.7423, longitude: -5.1671 },
  "antequera": { latitude: 37.0194, longitude: -4.5612 },
  "motril": { latitude: 36.7480, longitude: -3.5169 },
};

const ANDALUCIA_PROVINCES = new Set([
  "almeria",
  "cadiz",
  "cordoba",
  "granada",
  "huelva",
  "jaen",
  "malaga",
  "sevilla",
]);

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

const parseCoordinate = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

const usableWgs84Coords = (coordinates = []) => {
  const first = Array.isArray(coordinates) ? coordinates[0] : null;
  const latitude = parseCoordinate(first?.latitude);
  const longitude = parseCoordinate(first?.longitude);

  if (
    latitude != null &&
    longitude != null &&
    latitude >= 35 &&
    latitude <= 39 &&
    longitude >= -8 &&
    longitude <= -1
  ) {
    return { latitude, longitude };
  }

  return { latitude: null, longitude: null };
};

const provinceFrom = (item) =>
  stripHtml(item.province?.[0]?.province || item.province || "");

const firstImageUrl = (images = []) => {
  const image = Array.isArray(images) ? images[0] : null;
  const url = image?.thumbnail?.[0]?.image_url || image?.image_url || null;
  if (!url) return null;

  try {
    return new URL(url, "https://www.juntadeandalucia.es").href;
  } catch {
    return null;
  }
};

const isAndaluciaEvent = (item) => {
  const province = normalizeText(provinceFrom(item));
  const location = normalizeText(item.location);
  return ANDALUCIA_PROVINCES.has(province) || Boolean(ANDALUCIA_COORDS[location]);
};

const formatAndaluciaJuntaEvent = (item) => {
  if (!isAndaluciaEvent(item)) return null;

  const id = item.id;
  const title = stripHtml(item.title);
  const registration = Array.isArray(item.date_registration)
    ? item.date_registration[0] || {}
    : {};
  const startDate = parseDate(registration.start_date_registration);
  const endDate = parseDate(registration.end_date_registration);
  if (!id || !title || !startDate) return null;

  const today = new Date().toISOString().slice(0, 10);
  const date = startDate >= today ? startDate : endDate && endDate >= today ? today : startDate;
  const description = stripHtml(item.description || "");
  const province = provinceFrom(item);
  const rawCity = stripHtml(item.location || province || "");
  const city = rawCity || province || null;
  const address = stripHtml(item.address || "");
  const coordinates = usableWgs84Coords(item.coordinates);
  const fallbackCoords = ANDALUCIA_COORDS[normalizeText(city)] ||
    ANDALUCIA_COORDS[normalizeText(province)] ||
    { latitude: null, longitude: null };
  const latitude = coordinates.latitude ?? fallbackCoords.latitude;
  const longitude = coordinates.longitude ?? fallbackCoords.longitude;
  const category = categoryFromText(
    title,
    description,
    item.cost,
    item.matter,
    item.organisms?.map((entry) => entry.organisms).join(" "),
    item.themes?.map((entry) => entry.themes).join(" "),
  );
  const url = item.more_info || null;

  return {
    id: `andalucia_${id}`,
    externalId: `andalucia_${id}`,
    title,
    description,
    date,
    endDate,
    timeStart: parseTime(item.schedule),
    startsAt: `${date}T${parseTime(item.schedule)}:00`,
    location: [address, city].filter(Boolean).join(", ") || "Andalucía",
    city,
    latitude,
    longitude,
    image: firstImageUrl(item.image),
    images: firstImageUrl(item.image) ? [{ url: firstImageUrl(item.image) }] : [],
    type: "api",
    source: "andalucia_junta",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
    price: /gratuit|gratis/i.test(String(item.cost || "")) ? 0 : null,
    currency: "EUR",
  };
};

async function refreshAndaluciaJuntaEvents() {
  const response = await fetch(ANDALUCIA_EVENTS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Junta Andalucia HTTP ${response.status}`);
  }

  const rawEvents = await response.json();
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const events = [];

  for (const item of Array.isArray(rawEvents) ? rawEvents : []) {
    const event = formatAndaluciaJuntaEvent(item);
    if (!event || event.date < today || seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }

  cache = { events, updatedAt: Date.now() };
  console.log(`Junta Andalucia: ${events.length} eventos actualizados`);
  return events;
}

async function fetchAndaluciaJuntaEvents() {
  if (process.env.DISABLE_ANDALUCIA_JUNTA === "true") return [];

  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  if (pending) return pending;

  pending = refreshAndaluciaJuntaEvents()
    .catch((error) => {
      console.warn("Junta Andalucia no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function warmAndaluciaJuntaCache() {
  if (process.env.DISABLE_ANDALUCIA_JUNTA === "true") return;
  await fetchAndaluciaJuntaEvents();
}

export {
  fetchAndaluciaJuntaEvents,
  formatAndaluciaJuntaEvent,
  warmAndaluciaJuntaCache,
};
