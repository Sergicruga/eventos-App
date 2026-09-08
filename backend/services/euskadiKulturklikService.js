import { categoryFromText } from "./categoryUtils.js";

const EUSKADI_EVENTS_URL = "https://api.euskadi.eus/culture/events/v1.0/events/upcoming";
const CACHE_TTL_MS = Number(process.env.EUSKADI_KULTURKLIK_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.EUSKADI_KULTURKLIK_MAX_EVENTS || 180);

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
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const parseTime = (value) => {
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{1,2})(?:[:.]\s?|\s*h\s*)(\d{2})?/i);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${(match[2] || "00").padStart(2, "0")}`;
};

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const cityCoords = {
  bilbao: { latitude: 43.2630, longitude: -2.9350 },
  donostia: { latitude: 43.3183, longitude: -1.9812 },
  "san sebastian": { latitude: 43.3183, longitude: -1.9812 },
  vitoria: { latitude: 42.8467, longitude: -2.6727 },
  "vitoria-gasteiz": { latitude: 42.8467, longitude: -2.6727 },
};

const coordsForCity = (city) => {
  const normalized = normalize(city);
  const key = Object.keys(cityCoords).find((candidate) => normalized.includes(candidate));
  return key ? cityCoords[key] : { latitude: null, longitude: null };
};

const isBasqueEvent = (item, city) => {
  const text = normalize(
    [
      city,
      item.provinceEs,
      item.provinceEu,
      item.territoryEs,
      item.territoryEu,
      item.municipalityEs,
      item.municipalityEu,
    ].filter(Boolean).join(" "),
  );

  if (/pamplona|iruna|iruña|navarra|nafarroa/.test(text)) return false;

  return /bilbao|bizkaia|vizcaya|donostia|san sebastian|gipuzkoa|guipuzcoa|vitoria|gasteiz|araba|alava|barakaldo|getxo|irun|eibar|zarautz/.test(text);
};

const firstUrl = (...values) =>
  values.find((value) => typeof value === "string" && /^https?:\/\//i.test(value.trim())) || null;

const formatEuskadiEvent = (item) => {
  const id = item.id || item.eventId;
  const title = stripHtml(item.nameEs || item.nameEu || item.title || "");
  const date = parseDate(item.startDate || item.date);
  if (!id || !title || !date) return null;

  const description = stripHtml(item.descriptionEs || item.descriptionEu || "");
  const city = item.municipalityEs || item.municipalityEu || item.townEs || item.provinceEs || null;
  if (!isBasqueEvent(item, city)) return null;

  const venue = item.establishmentEs || item.establishmentEu || item.placeEs || item.placeEu || "";
  const category = categoryFromText(title, item.typeEs, item.typeEu, description);
  const timeStart = parseTime(item.openingHoursEs || item.openingHoursEu || item.startTime);
  const coords = coordsForCity(city);
  const url = firstUrl(item.purchaseUrlEs, item.purchaseUrlEu, item.sourceUrlEs, item.sourceUrlEu, item.url);

  return {
    id: `euskadi_${id}`,
    externalId: `euskadi_${id}`,
    title,
    description,
    date,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location: [venue, city].filter(Boolean).join(", ") || "Euskadi",
    city,
    latitude: Number(item.latitude) || coords.latitude,
    longitude: Number(item.longitude) || coords.longitude,
    image: firstUrl(item.imageUrl, item.image, item.pictureUrl),
    images: [],
    type: "api",
    source: "euskadi_kulturklik",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    subcategory_slug: category.subcategory_slug || null,
    subcategory_name: category.subcategory_name || null,
    genre: category.name,
    price: item.priceEs || item.priceEu || null,
  };
};

async function refreshEvents() {
  if (pending) return pending;

  pending = (async () => {
    const url = new URL(EUSKADI_EVENTS_URL);
    url.searchParams.set("_elements", String(Math.min(MAX_EVENTS, 200)));

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "GoPlan/1.0" },
    });

    if (!response.ok) throw new Error(`Euskadi Kulturklik HTTP ${response.status}`);

    const data = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    const events = (data.items || [])
      .map(formatEuskadiEvent)
      .filter((event) => event && event.date >= today)
      .slice(0, MAX_EVENTS);

    cache = { events, updatedAt: Date.now() };
    console.log(`Euskadi Kulturklik: ${events.length} eventos actualizados`);
    return events;
  })()
    .catch((error) => {
      console.warn("Euskadi Kulturklik no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function fetchEuskadiKulturklikEvents() {
  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) return cache.events;
  return refreshEvents();
}

async function warmEuskadiKulturklikCache() {
  try {
    await refreshEvents();
  } catch {}
}

export { fetchEuskadiKulturklikEvents, warmEuskadiKulturklikCache };

