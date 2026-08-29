import { categoryFromText } from "./categoryUtils.js";

const GALICIA_RSS_URL =
  "https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0045/axenda-cultura-galicia/101/acceso-aos-datos.rss";
const CACHE_TTL_MS = Number(process.env.GALICIA_AXENDA_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.GALICIA_AXENDA_MAX_EVENTS || 160);

let cache = { events: [], updatedAt: 0 };
let pending = null;

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
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const pickTag = (xml, tag) => {
  const match = String(xml).match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
};

const parseItems = (xml) => {
  const matches = String(xml || "").match(/<item>[\s\S]*?<\/item>/g) || [];
  return matches.map((itemXml) => ({
    title: stripHtml(pickTag(itemXml, "title")),
    link: stripHtml(pickTag(itemXml, "link")),
    descriptionHtml: pickTag(itemXml, "description"),
    pubDate: stripHtml(pickTag(itemXml, "pubDate")),
  }));
};

const imageFromHtml = (html = "") => {
  const decoded = decodeXml(html);
  const match = decoded.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] || null;
};

const parseDate = (item) => {
  const text = stripHtml(`${item.descriptionHtml || ""} ${item.pubDate || ""}`);
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const parsed = new Date(item.pubDate);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
};

const parseTime = (html = "") => {
  const text = stripHtml(html);
  const match = text.match(/(\d{1,2})(?:[:.]\s?|\s*h\s*)(\d{2})/i);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${match[2].padStart(2, "0")}`;
};

const cityCoords = {
  "a coruña": { latitude: 43.3623, longitude: -8.4115 },
  coruna: { latitude: 43.3623, longitude: -8.4115 },
  "santiago de compostela": { latitude: 42.8782, longitude: -8.5448 },
  vigo: { latitude: 42.2406, longitude: -8.7207 },
  pontevedra: { latitude: 42.4336, longitude: -8.6479 },
  ourense: { latitude: 42.3358, longitude: -7.8639 },
  lugo: { latitude: 43.0097, longitude: -7.5568 },
};

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const cityFromText = (text = "") => {
  const normalized = normalize(text);
  const key = Object.keys(cityCoords).find((city) => normalized.includes(normalize(city)));
  return key || null;
};

const formatGaliciaEvent = (item) => {
  const id = String(item.link || item.title).split("/").filter(Boolean).pop() || item.title;
  const title = item.title;
  if (!id || !title) return null;

  const description = stripHtml(item.descriptionHtml);
  const date = parseDate(item);
  const timeStart = parseTime(item.descriptionHtml);
  const city = cityFromText(`${description} ${title}`);
  const coords = city ? cityCoords[city] : { latitude: null, longitude: null };
  const category = categoryFromText(title, description);
  const image = imageFromHtml(item.descriptionHtml);

  return {
    id: `galicia_${id}`,
    externalId: `galicia_${id}`,
    title,
    description,
    date,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location: city ? `${city}, Galicia` : "Galicia",
    city,
    latitude: coords.latitude,
    longitude: coords.longitude,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "galicia_axenda",
    url: item.link || null,
    purchaseUrl: item.link || null,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
  };
};

async function refreshEvents() {
  if (pending) return pending;

  pending = (async () => {
    const response = await fetch(GALICIA_RSS_URL, {
      headers: { Accept: "application/rss+xml, text/xml", "User-Agent": "GoPlan/1.0" },
    });

    if (!response.ok) throw new Error(`Galicia Axenda HTTP ${response.status}`);

    const xml = await response.text();
    const today = new Date().toISOString().slice(0, 10);
    const events = parseItems(xml)
      .map(formatGaliciaEvent)
      .filter((event) => event && event.date >= today)
      .slice(0, MAX_EVENTS);

    cache = { events, updatedAt: Date.now() };
    console.log(`Galicia Axenda: ${events.length} eventos actualizados`);
    return events;
  })()
    .catch((error) => {
      console.warn("Galicia Axenda no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function fetchGaliciaAxendaEvents() {
  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) return cache.events;
  return refreshEvents();
}

async function warmGaliciaAxendaCache() {
  try {
    await refreshEvents();
  } catch {}
}

export { fetchGaliciaAxendaEvents, warmGaliciaAxendaCache };
