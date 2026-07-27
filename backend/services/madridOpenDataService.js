const MADRID_EVENTS_URL =
  "https://datos.madrid.es/dataset/206974-0-agenda-eventos-culturales-100/resource/206974-0-agenda-eventos-culturales-100-json/download/206974-0-agenda-eventos-culturales-100.json";

const CACHE_TTL_MS = Number(
  process.env.MADRID_OPEN_DATA_CACHE_TTL_MS || 6 * 60 * 60 * 1000,
);
const MAX_EVENTS = Number(process.env.MADRID_OPEN_DATA_MAX_EVENTS || 120);

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

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const absoluteUrl = (url) => {
  if (!url) return null;
  try {
    return new URL(String(url), "https://www.madrid.es").href;
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
  const raw = String(value || "").trim();
  const match = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const categoryFromText = (...parts) => {
  const text = parts.join(" ").toLowerCase();
  if (/concierto|música|musica|festival|flamenco|jazz|rock|pop|dj/.test(text)) {
    return { slug: "musica", name: "Música" };
  }
  if (/deporte|carrera|fútbol|futbol|basket|tenis|yoga|running/.test(text)) {
    return { slug: "deportes", name: "Deportes" };
  }
  if (/cine|película|pelicula|film|proyección|proyeccion/.test(text)) {
    return { slug: "cine", name: "Cine" };
  }
  if (/taller|curso|charla|conferencia|formación|formacion|educa/.test(text)) {
    return { slug: "educacion", name: "Educación" };
  }
  if (/gastronom|mercado|comida|vino|tapa/.test(text)) {
    return { slug: "gastronomia", name: "Gastronomía" };
  }
  if (
    /teatro|danza|exposici|museo|arte|literatura|poesía|poesia|circo|comedia|infantil|visita/.test(
      text,
    )
  ) {
    return { slug: "arte", name: "Arte" };
  }
  return { slug: "otro", name: "Otro" };
};

const pickImage = (item) => {
  const candidates = [
    item.image,
    item["image-url"],
    item["imagen"],
    item["@image"],
    ...asArray(item.references),
  ];

  return (
    candidates
      .map((candidate) => {
        if (typeof candidate === "string") return absoluteUrl(candidate);
        return absoluteUrl(candidate?.url || candidate?.href || candidate?.value);
      })
      .find(Boolean) || null
  );
};

const pickLink = (item) =>
  absoluteUrl(item.link || item.url || item["@id"] || item.id || item.uid);

const pickLocationName = (item) => {
  const address = item.address || {};
  return (
    item["event-location"] ||
    item.location?.name ||
    address["street-address"] ||
    address.streetAddress ||
    "Madrid"
  );
};

const pickCoordinates = (item) => {
  const location = item.location || {};
  const geo = location.geo || {};
  const latitude =
    location.latitude ||
    location.lat ||
    geo.latitude ||
    item.latitude ||
    item.lat ||
    null;
  const longitude =
    location.longitude ||
    location.lon ||
    location.lng ||
    geo.longitude ||
    item.longitude ||
    item.lon ||
    item.lng ||
    null;

  return {
    latitude: latitude != null ? Number(latitude) : null,
    longitude: longitude != null ? Number(longitude) : null,
  };
};

const formatMadridEvent = (item) => {
  const date = parseDate(item.dtstart || item["dtstart"] || item.date || item.fecha);
  if (!date) return null;

  const title = stripHtml(item.title || item.titulo || item.name);
  if (!title) return null;

  const description = stripHtml(item.description || item.descripcion || "");
  const categoryRaw = asArray(item["event-category"] || item.category || item.categories)
    .map((value) => (typeof value === "string" ? value : value?.title || value?.name || ""))
    .join(" ");
  const category = categoryFromText(title, description, categoryRaw);
  const timeStart = parseTime(item.time || item.hora || item["time-start"]);
  const externalId = String(item.uid || item.id || item["@id"] || title).replace(/\s+/g, "_");
  const coordinates = pickCoordinates(item);
  const location = pickLocationName(item);
  const url = pickLink(item);
  const image = pickImage(item);

  return {
    id: `madrid_${externalId}`,
    externalId: `madrid_${externalId}`,
    title,
    description,
    date,
    timeStart,
    startsAt: `${date}T${timeStart}:00`,
    location,
    city: "Madrid",
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "madrid_open_data",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
    price: item.free === 1 || item.free === "1" || item.free === true ? 0 : null,
    currency: "EUR",
  };
};

async function refreshMadridOpenDataEvents() {
  const response = await fetch(MADRID_EVENTS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Madrid Open Data HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawEvents = data?.["@graph"] || data?.graph || data?.records || [];
  const seen = new Set();
  const events = [];

  for (const item of rawEvents) {
    const event = formatMadridEvent(item);
    if (!event || seen.has(event.externalId)) continue;
    seen.add(event.externalId);
    events.push(event);
    if (events.length >= MAX_EVENTS) break;
  }

  cache = { events, updatedAt: Date.now() };
  console.log(`Madrid Open Data: ${events.length} eventos actualizados`);
  return events;
}

async function fetchMadridOpenDataEvents() {
  if (process.env.DISABLE_MADRID_OPEN_DATA === "true") return [];

  if (cache.events.length && Date.now() - cache.updatedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  if (pending) return pending;

  pending = refreshMadridOpenDataEvents()
    .catch((error) => {
      console.warn("Madrid Open Data no disponible:", error.message);
      return cache.events || [];
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

async function warmMadridOpenDataCache() {
  if (process.env.DISABLE_MADRID_OPEN_DATA === "true") return;
  await fetchMadridOpenDataEvents();
}

export {
  fetchMadridOpenDataEvents,
  formatMadridEvent,
  warmMadridOpenDataCache,
};
