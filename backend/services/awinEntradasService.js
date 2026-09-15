import fs from "fs/promises";
import zlib from "zlib";
import { categoryFromText } from "./categoryUtils.js";

const CACHE_TTL_MS = Number(process.env.AWIN_ENTRADAS_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const DEFAULT_MAX_EVENTS = Number(process.env.AWIN_ENTRADAS_MAX_EVENTS || 350);
const DEFAULT_RADIUS_EXTRA_KM = Number(process.env.AWIN_ENTRADAS_RADIUS_EXTRA_KM || 15);

let cache = {
  fetchedAt: 0,
  events: [],
};

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const toNumberOrNull = (value) => {
  if (value == null || value === "") return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
};

const distanceKm = (a, b) => {
  if (!a || !b || a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) {
    return null;
  }

  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  return rows;
};

const rowsToObjects = (rows) => {
  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj;
  });
};

async function readFeedBuffer() {
  const feedUrl = process.env.AWIN_ENTRADAS_FEED_URL;
  const feedFile = process.env.AWIN_ENTRADAS_FEED_FILE;

  if (feedUrl) {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      throw new Error(`Awin feed HTTP ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  if (feedFile) {
    return fs.readFile(feedFile);
  }

  return null;
}

const decodeFeed = (buffer) => {
  if (!buffer) return "";
  const isGzip = buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  return (isGzip ? zlib.gunzipSync(buffer) : buffer).toString("utf8");
};

const mapAwinRowToEvent = (row) => {
  const eventDate = String(row["Tickets:event_date"] || "").slice(0, 10);
  if (!eventDate) return null;

  const timestamp = Date.parse(`${eventDate}T23:59:59`);
  if (!Number.isFinite(timestamp) || timestamp < Date.now() - 24 * 60 * 60 * 1000) return null;

  const awProductId = row.aw_product_id || row.merchant_product_id;
  if (!awProductId) return null;

  const title =
    row["Tickets:event_name"] ||
    row.product_name ||
    row["Tickets:primary_artist"] ||
    "Evento entradas.com";
  const genre = row["Tickets:genre"] || row.merchant_category || row.category_name || "";
  const venue = row["Tickets:venue_name"] || "";
  const city = row["Tickets:event_location_city"] || "";
  const address =
    row["Tickets:event_location_address"] ||
    row["Tickets:venue_address"] ||
    "";
  const category = categoryFromText(title, genre, venue, row.description);
  const latitude = toNumberOrNull(row["Tickets:latitude"]);
  const longitude = toNumberOrNull(row["Tickets:longitude"]);
  const minPrice = row["Tickets:min_price"] || row.search_price || row.store_price || "";
  const maxPrice = row["Tickets:max_price"] || "";
  const priceText = minPrice
    ? maxPrice && maxPrice !== minPrice
      ? `Entradas desde ${minPrice}€ hasta ${maxPrice}€`
      : `Entradas desde ${minPrice}€`
    : "";

  return {
    id: `entradas_awin_${awProductId}`,
    title,
    description: [row.description, genre, priceText].filter(Boolean).join("\n"),
    date: eventDate,
    event_at: eventDate,
    location: [venue, city].filter(Boolean).join(", ") || address || city,
    venue_name: venue || null,
    city: city || null,
    country: row["Tickets:event_location_country"] || "ES",
    latitude,
    longitude,
    image: row.merchant_image_url || row.aw_image_url || null,
    type: "api",
    source: "entradas_awin",
    externalId: String(awProductId),
    external_id: String(awProductId),
    url: row.aw_deep_link || row.merchant_deep_link || null,
    purchaseUrl: row.aw_deep_link || row.merchant_deep_link || null,
    category_slug: category.slug,
    category_name: category.name,
    subcategory_slug: category.subcategory_slug || null,
    subcategory_name: category.subcategory_name || null,
    genre,
    min_price: minPrice || null,
    max_price: maxPrice || null,
  };
};

async function loadAwinEntradasEvents() {
  const now = Date.now();
  if (cache.events.length && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.events;
  }

  const buffer = await readFeedBuffer();
  if (!buffer) {
    cache = { fetchedAt: now, events: [] };
    return [];
  }

  const text = decodeFeed(buffer);
  const rows = rowsToObjects(parseCsv(text));
  const events = rows
    .map(mapAwinRowToEvent)
    .filter(Boolean)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  cache = { fetchedAt: now, events };
  console.log(`Awin entradas.com: ${events.length} eventos cargados`);
  return events;
}

function filterAwinEvents(events, { citiesToFetch = [], userCoords = null, radiusKm = 25 } = {}) {
  const normalizedCities = new Set(
    (citiesToFetch || []).map((city) => normalizeText(city)).filter(Boolean)
  );
  const radiusLimit = Number(radiusKm || 25) + DEFAULT_RADIUS_EXTRA_KM;

  const filtered = events.filter((event) => {
    if (userCoords && event.latitude != null && event.longitude != null) {
      const distance = distanceKm(userCoords, {
        latitude: event.latitude,
        longitude: event.longitude,
      });
      return distance == null ? false : distance <= radiusLimit;
    }

    if (normalizedCities.size) {
      const city = normalizeText(event.city);
      return normalizedCities.has(city);
    }

    return true;
  });

  return filtered.slice(0, DEFAULT_MAX_EVENTS);
}

async function fetchAwinEntradasEvents(options = {}) {
  try {
    const events = await loadAwinEntradasEvents();
    return filterAwinEvents(events, options);
  } catch (error) {
    console.warn("Awin entradas.com no disponible:", error?.message || error);
    return [];
  }
}

function warmAwinEntradasCache() {
  loadAwinEntradasEvents().catch((error) => {
    console.warn("No se pudo precalentar Awin entradas.com:", error?.message || error);
  });
}

export { fetchAwinEntradasEvents, warmAwinEntradasCache };
