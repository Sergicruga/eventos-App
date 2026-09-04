import { categoryFromText } from "./categoryUtils.js";

const ZARAGOZA_EVENTS_URL =
  "https://www.zaragoza.es/sede/servicio/cultura/evento/list.json";
const CACHE_TTL_MS = Number(process.env.ZARAGOZA_AGENDA_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.ZARAGOZA_AGENDA_MAX_EVENTS || 140);

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

const parseTime = (subEvent) => {
  const first = Array.isArray(subEvent?.openingHours) ? subEvent.openingHours[0] : null;
  const raw = first?.startTime || "";
  const match = String(raw).match(/(\d{1,2}):(\d{2})/);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const imageFrom = (item) => {
  const candidates = [
    item.image,
    item.imagen,
    item.thumbnail,
    item.photo,
    item?.attachment?.[0]?.url,
  ];
  return candidates.find((value) => typeof value === "string" && /^https?:\/\//i.test(value)) || null;
};

const formatZaragozaEvent = (item) => {
  const subEvent = Array.isArray(item.subEvent) ? item.subEvent[0] : null;
  const id = item.id || subEvent?.id;
  const title = stripHtml(item.title || item.name || "");
  const date = parseDate(subEvent?.startDate || item.startDate || item.date);
  if (!id || !title || !date) return null;

  const description = stripHtml(item.description || item.text || "");
  const venue = subEvent?.location?.title || item.location?.title || "";
  const city = subEvent?.location?.addressLocality || "Zaragoza";
  const timeStart = parseTime(subEvent);
  const category = categoryFromText(title, description, item.category, item.tipo);
  const url =
    item.url ||
    item.sameAs ||
    `https://www.zaragoza.es/sede/servicio/cultura/evento/${encodeURIComponent(id)}`;
  const image = imageFrom(item);

  return {
    id: `zaragoza_${id}`,
    externalId: `zaragoza_${id}`,
    title,
    description,
    date,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location: [venue, city].filter(Boolean).join(", ") || "Zaragoza",
    city,
    latitude: 41.6488,
    longitude: -0.8891,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "zaragoza_agenda",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    subcategory_slug: category.subcategory_slug || null,
    subcategory_name: category.subcategory_name || null,
    genre: category.name,
  };
};

async function refreshEvents() {
  if (pending) return pending;

  pending = (async () => {
    const url = new URL(ZARAGOZA_EVENTS_URL);
    url.searchParams.set("rows", String(Math.min(MAX_EVENTS, 500)));
    url.searchParams.set("start", "0");

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "GoPlan/1.0" },
    });

    if (!response.ok) throw new Error(`Zaragoza Agenda HTTP ${response.status}`);

    const data = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    const events = (data.result || [])
      .map(formatZaragozaEvent)
      .filter((event) => event && event.date >= today)
      .slice(0, MAX_EVENTS);

    cache = { events, updatedAt: Date.now() };
    console.log(`Zaragoza Agenda: ${events.length} eventos actualizados`);
    return events;
  })()
    .catch((error) => {
      console.warn("Zaragoza Agenda no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function fetchZaragozaAgendaEvents() {
  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) return cache.events;
  return refreshEvents();
}

async function warmZaragozaAgendaCache() {
  try {
    await refreshEvents();
  } catch {}
}

export { fetchZaragozaAgendaEvents, warmZaragozaAgendaCache };

