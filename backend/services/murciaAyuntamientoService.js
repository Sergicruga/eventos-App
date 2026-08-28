import { categoryFromText } from "./categoryUtils.js";

const MURCIA_EVENTS_RSS_URL = "https://eventos.murcia.es/rss.html";

const CACHE_TTL_MS = Number(process.env.MURCIA_AYUNTAMIENTO_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.MURCIA_AYUNTAMIENTO_MAX_EVENTS || 80);

let cache = { events: [], updatedAt: 0 };
let pending = null;

const MUNICIPALITY_COORDS = {
  murcia: { latitude: 37.9922, longitude: -1.1307 },
  cartagena: { latitude: 37.6257, longitude: -0.9966 },
  lorca: { latitude: 37.6713, longitude: -1.7017 },
  "san javier": { latitude: 37.8063, longitude: -0.8374 },
  "san pedro del pinatar": { latitude: 37.8357, longitude: -0.7910 },
  "torre pacheco": { latitude: 37.7429, longitude: -0.9535 },
  jumilla: { latitude: 38.4792, longitude: -1.3250 },
  "águilas": { latitude: 37.4063, longitude: -1.5829 },
  aguilas: { latitude: 37.4063, longitude: -1.5829 },
  mazarrón: { latitude: 37.5992, longitude: -1.3149 },
  mazarron: { latitude: 37.5992, longitude: -1.3149 },
  moratalla: { latitude: 38.1893, longitude: -1.8918 },
  totana: { latitude: 37.7689, longitude: -1.5023 },
  yecla: { latitude: 38.6137, longitude: -1.1147 },
  bullas: { latitude: 38.0468, longitude: -1.6721 },
  "santiago de la ribera": { latitude: 37.7970, longitude: -0.8048 },
  "los alcázares": { latitude: 37.7443, longitude: -0.8504 },
  "los alcazares": { latitude: 37.7443, longitude: -0.8504 },
};

const decodeXml = (value = "") =>
  String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

const stripHtml = (value = "") =>
  decodeXml(value)
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]*>/g, " ")
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
    return new URL(String(url), "https://eventos.murcia.es").href;
  } catch {
    return null;
  }
};

const parseRssItems = (xml) => {
  const matches = String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || [];
  return matches.map((itemXml) => {
    const pick = (tag) => {
      const match = itemXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return match ? decodeXml(match[1]).trim().replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim() : "";
    };
    return {
      title: pick("title"),
      link: pick("link"),
      pubDate: pick("pubDate"),
      description: pick("description"),
    };
  });
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const parseTime = (value) => {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(11, 16);
  }
  return "20:00";
};

const firstParagraphText = (value = "") => {
  const match = String(value).match(/<p>([\s\S]*?)<\/p>/i);
  return stripHtml(match ? match[1] : value);
};

const cityFromText = (...parts) => {
  const cityNames = Object.keys(MUNICIPALITY_COORDS)
    .sort((a, b) => b.length - a.length)
  let found = null;

  for (const part of parts.filter(Boolean)) {
    const text = normalizeText(part);
    found = cityNames.find((city) => text.includes(normalizeText(city)));
    if (found) break;
  }

  if (!found) return "Murcia";
  return found
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const formatMurciaAyuntamientoEvent = (item) => {
  const title = stripHtml(item.title);
  const date = parseDate(item.pubDate);
  if (!title || !date) return null;

  const description = stripHtml(item.description);
  const city = cityFromText(firstParagraphText(item.description), title, description);
  const coordinates = MUNICIPALITY_COORDS[normalizeText(city)] || MUNICIPALITY_COORDS.murcia;
  const url = absoluteUrl(item.link);
  const category = categoryFromText(title, description);
  const externalId =
    url?.match(/event_detail\/(\d+)\.html/i)?.[1] ||
    normalizeText(`${title}-${date}`).replace(/[^a-z0-9]+/g, "-").slice(0, 120);

  return {
    id: `murcia_${externalId}`,
    externalId: `murcia_${externalId}`,
    title,
    description,
    date,
    timeStart: parseTime(item.pubDate),
    startsAt: `${date}T${parseTime(item.pubDate)}:00`,
    location: city,
    city,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    image: null,
    images: [],
    type: "api",
    source: "murcia_ayuntamiento",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
    price: /gratuit|gratis|entrada libre/i.test(description) ? 0 : null,
    currency: "EUR",
  };
};

async function refreshMurciaAyuntamientoEvents() {
  const response = await fetch(MURCIA_EVENTS_RSS_URL, {
    headers: { Accept: "application/rss+xml, text/xml, application/xml" },
  });
  if (!response.ok) {
    throw new Error(`Ayuntamiento Murcia RSS HTTP ${response.status}`);
  }

  const xml = await response.text();
  const rawItems = parseRssItems(xml);
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const events = [];

  for (const item of rawItems) {
    const event = formatMurciaAyuntamientoEvent(item);
    if (!event || event.date < today || seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }

  cache = { events, updatedAt: Date.now() };
  console.log(`Ayuntamiento Murcia: ${events.length} eventos actualizados`);
  return events;
}

async function fetchMurciaAyuntamientoEvents() {
  if (process.env.DISABLE_MURCIA_AYUNTAMIENTO === "true") return [];

  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  if (pending) return pending;

  pending = refreshMurciaAyuntamientoEvents()
    .catch((error) => {
      console.warn("Ayuntamiento Murcia no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function warmMurciaAyuntamientoCache() {
  if (process.env.DISABLE_MURCIA_AYUNTAMIENTO === "true") return;
  await fetchMurciaAyuntamientoEvents();
}

export {
  fetchMurciaAyuntamientoEvents,
  formatMurciaAyuntamientoEvent,
  warmMurciaAyuntamientoCache,
};
