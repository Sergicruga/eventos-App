const DIBA_EVENTS_URL = "https://do.diba.cat/api/dataset/actesturisme_es/format/json";

const CACHE_TTL_MS = Number(process.env.BARCELONA_DIBA_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MAX_EVENTS = Number(process.env.BARCELONA_DIBA_MAX_EVENTS || 180);

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

const categoryFromText = (...parts) => {
  const text = parts.join(" ").toLowerCase();
  if (/música|musica|concert|concierto|festival|jazz|rock|pop|dj|flamenc/.test(text)) {
    return { slug: "musica", name: "Música" };
  }
  if (/esport|deporte|cursa|carrera|futbol|fútbol|basket|tennis|tenis|running/.test(text)) {
    return { slug: "deportes", name: "Deportes" };
  }
  if (/cine|cinema|pel·lícula|pelicula|film|projecci|proyecci/.test(text)) {
    return { slug: "cine", name: "Cine" };
  }
  if (/taller|curso|curs|xerrada|charla|conferència|conferencia|formaci|educa/.test(text)) {
    return { slug: "educacion", name: "Educación" };
  }
  if (/gastronom|mercat|mercado|menjar|comida|vi\b|vino|tapa/.test(text)) {
    return { slug: "gastronomia", name: "Gastronomía" };
  }
  if (
    /teatre|teatro|dansa|danza|exposici|museu|museo|art|literatura|poesia|circ|circo|comèdia|comedia|tradici|cultura/.test(
      text,
    )
  ) {
    return { slug: "arte", name: "Arte" };
  }
  return { slug: "otro", name: "Otro" };
};

const extractItems = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.elements)) return data.elements;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.records)) return data.records;
  return [];
};

const formatDibaEvent = (item) => {
  const id = item.acte_id || item.id || item.id_secundari;
  const title = stripHtml(item.titol || item.title || item.name);
  const date = parseDate(item.data_inici || item.date || item.startDate);
  if (!id || !title || !date) return null;

  const description = stripHtml(item.descripcio || item.cos || item.description || "");
  const municipality = stripHtml(item.municipi_nom || item.municipi || "Barcelona");
  const venue = stripHtml(item.adreca_nom || item.venue || "");
  const address = stripHtml(item.adreca || "");
  const location = [venue, address, municipality].filter(Boolean).join(", ");
  const coordinates = parseCoordinates(item.localitzacio || item.location);
  const category = categoryFromText(
    title,
    description,
    item.categoria,
    item.tags,
    item.rel_temes,
    item.tipus,
  );
  const image = absoluteUrl(item.imatge || item.image);
  const url = absoluteUrl(item.acte_url || item.url_general || item.url || item.documentacio);
  const timeStart = parseTime(item.observacions_horari || item.dies || item.data_inici);

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
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    image,
    images: image ? [{ url: image }] : [],
    type: "api",
    source: "barcelona_diba",
    url,
    purchaseUrl: url,
    category_slug: category.slug,
    category_name: category.name,
    genre: category.name,
    price: /gratu/i.test(String(item.preu || "")) ? 0 : null,
    currency: "EUR",
  };
};

async function refreshBarcelonaDibaEvents() {
  const response = await fetch(DIBA_EVENTS_URL, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Diputació Barcelona HTTP ${response.status}`);
  }

  const data = await response.json();
  const rawEvents = extractItems(data);
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
  console.log(`Diputació Barcelona: ${events.length} eventos actualizados`);
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
      console.warn("Diputació Barcelona no disponible:", error.message);
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
