import { categoryFromText } from "./categoryUtils.js";

const CACHE_TTL_MS = Number(process.env.REGIONAL_HTML_AGENDA_CACHE_TTL_MS || 3 * 60 * 60 * 1000);
const MAX_CLM_EVENTS = Number(process.env.CLM_AGENDA_MAX_EVENTS || 120);
const MAX_PAMPLONA_EVENTS = Number(process.env.PAMPLONA_AGENDA_MAX_EVENTS || 80);
const MAX_RIOJA_EVENTS = Number(process.env.RIOJA_TEATROS_MAX_EVENTS || 80);

const caches = new Map();
const pending = new Map();

const htmlDecode = (value = "") =>
  String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&ntilde;/g, "ñ")
    .replace(/&aacute;/g, "á")
    .replace(/&eacute;/g, "é")
    .replace(/&iacute;/g, "í")
    .replace(/&oacute;/g, "ó")
    .replace(/&uacute;/g, "ú")
    .replace(/&nbsp;/g, " ");

const stripHtml = (value = "") =>
  htmlDecode(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const absoluteUrl = (base, value) => {
  if (!value) return null;
  try {
    return new URL(htmlDecode(value), base).toString();
  } catch {
    return null;
  }
};

const normalize = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const parseIsoDate = (value) => {
  const raw = String(value || "");
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const spanish = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (spanish) return `${spanish[3]}-${spanish[2].padStart(2, "0")}-${spanish[1].padStart(2, "0")}`;
  return null;
};

const monthNumber = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

const parseSpanishLongDate = (value, fallbackYear = new Date().getFullYear()) => {
  const text = normalize(value);
  const match = text.match(/(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(\d{4}))?/);
  if (!match) return null;
  const year = match[3] || fallbackYear;
  return `${year}-${monthNumber[match[2]]}-${match[1].padStart(2, "0")}`;
};

const parseTime = (value) => {
  const match = String(value || "").match(/(\d{1,2})[:.](\d{2})\s*h?/i);
  if (!match) return "20:00";
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const pick = (html, regex) => {
  const match = String(html || "").match(regex);
  return match ? stripHtml(match[1]) : "";
};

const pickAttr = (html, regex, baseUrl) => {
  const match = String(html || "").match(regex);
  return match ? absoluteUrl(baseUrl, match[1]) : null;
};

const cityCoords = {
  albacete: { latitude: 38.9943, longitude: -1.8585 },
  "ciudad real": { latitude: 38.9848, longitude: -3.9274 },
  cuenca: { latitude: 40.0704, longitude: -2.1374 },
  guadalajara: { latitude: 40.6325, longitude: -3.1602 },
  toledo: { latitude: 39.8628, longitude: -4.0273 },
  pamplona: { latitude: 42.8125, longitude: -1.6458 },
  logroño: { latitude: 42.4627, longitude: -2.4449 },
  logrono: { latitude: 42.4627, longitude: -2.4449 },
  calahorra: { latitude: 42.3051, longitude: -1.9654 },
  autol: { latitude: 42.2156, longitude: -2.0056 },
  ezcaray: { latitude: 42.3254, longitude: -3.0136 },
  alfaro: { latitude: 42.1803, longitude: -1.7502 },
  arnedo: { latitude: 42.2280, longitude: -2.1009 },
};

const coordsForCity = (city) => cityCoords[normalize(city)] || { latitude: null, longitude: null };

const parseClmEvents = (html, baseUrl) => {
  const rows = html.match(/<div class="views-row">[\s\S]*?(?=<div class="views-row">|<\/main>|$)/g) || [];
  const today = new Date().toISOString().slice(0, 10);

  return rows
    .map((row) => {
      const id = row.match(/data-history-node-id="([^"]+)"/)?.[1] || pickAttr(row, /href="([^"]+)"/, baseUrl);
      const title = pick(row, /activity__title[\s\S]*?<p>([\s\S]*?)<\/p>/i);
      const cityRaw = pick(row, /field--name-field-localidad-actividad[\s\S]*?field__item">([\s\S]*?)<\/div>/i);
      const city = cityRaw.replace(/\s*\(capital\)\s*/i, "").trim();
      const dateText = pick(row, /field--name-field-fecha-actividad[\s\S]*?field__item">([\s\S]*?)<\/div>/i);
      const date = parseIsoDate(dateText);
      if (!id || !title || !date || date < today) return null;

      const venue = pick(row, /field--name-field-lugar-actividad[\s\S]*?field__item">([\s\S]*?)<\/div>/i);
      const image = pickAttr(row, /(?:data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i, baseUrl);
      const url = pickAttr(row, /class="article__link"\s+href="([^"]+)"/i, baseUrl);
      const coords = coordsForCity(city);
      const category = categoryFromText(title, venue, city);

      return {
        id: `clm_${id}`,
        externalId: `clm_${id}`,
        title,
        description: [venue, city].filter(Boolean).join(". "),
        date,
        timeStart: parseTime(row),
        startsAt: `${date}T${parseTime(row)}:00`,
        location: [venue, city, "Castilla-La Mancha"].filter(Boolean).join(", "),
        city,
        latitude: coords.latitude,
        longitude: coords.longitude,
        image,
        images: image ? [{ url: image }] : [],
        type: "api",
        source: "clm_agenda",
        url,
        purchaseUrl: url,
        category_slug: category.slug,
        category_name: category.name,
        genre: category.name,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_CLM_EVENTS);
};

const parsePamplonaEvents = (html, baseUrl) => {
  const rows = html.match(/<article about="\/actualidad\/eventos\/[\s\S]*?<\/article>/g) || [];
  const today = new Date().toISOString().slice(0, 10);

  return rows
    .map((row) => {
      const href = row.match(/about="([^"]+)"/)?.[1] || row.match(/href="([^"]+)"/)?.[1];
      const id = href || pick(row, /<h3[\s\S]*?>([\s\S]*?)<\/h3>/i);
      const title = pick(row, /<h3[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i);
      const date = parseIsoDate(row);
      if (!id || !title || !date || date < today) return null;

      const venue = pick(row, /field--name-field-event-info[\s\S]*?field--item">([\s\S]*?)<\/div>/i);
      const image = pickAttr(row, /(?:data-src|src)="([^"]+\.(?:jpg|jpeg|png|webp)[^"]*)"/i, baseUrl);
      const url = absoluteUrl(baseUrl, href);
      const category = categoryFromText(title, venue);

      return {
        id: `pamplona_${id.replace(/[^a-z0-9_-]+/gi, "_")}`,
        externalId: `pamplona_${id.replace(/[^a-z0-9_-]+/gi, "_")}`,
        title,
        description: venue,
        date,
        timeStart: parseTime(row),
        startsAt: `${date}T${parseTime(row)}:00`,
        location: [venue, "Pamplona"].filter(Boolean).join(", "),
        city: "Pamplona",
        latitude: 42.8125,
        longitude: -1.6458,
        image,
        images: image ? [{ url: image }] : [],
        type: "api",
        source: "pamplona_agenda",
        url,
        purchaseUrl: url,
        category_slug: category.slug,
        category_name: category.name,
        genre: category.name,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_PAMPLONA_EVENTS);
};

const parseRiojaEvents = (html, baseUrl) => {
  const cards = html.match(/<a class="espectaculo-card[\s\S]*?<\/a>/g) || [];
  const today = new Date().toISOString().slice(0, 10);

  return cards
    .map((card) => {
      const href = card.match(/href="([^"]+)"/)?.[1];
      const title = pick(card, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const venue = pick(card, /text-uppercase[^>]*>([\s\S]*?)<\/p>/i);
      const dateText = pick(card, /<span class="fw-bold">([\s\S]*?)<\/span>/i);
      const date = parseSpanishLongDate(dateText, new Date().getFullYear());
      if (!href || !title || !date || date < today) return null;

      const city =
        Object.keys(cityCoords).find((name) => normalize(venue).includes(name)) || "Logroño";
      const coords = coordsForCity(city);
      const image = pickAttr(card, /background:\s*url\('([^']+)'\)/i, baseUrl);
      const category = categoryFromText(title, venue, dateText);
      const url = absoluteUrl(baseUrl, href);

      return {
        id: `rioja_teatros_${href.split("/").filter(Boolean).pop()}`,
        externalId: `rioja_teatros_${href.split("/").filter(Boolean).pop()}`,
        title,
        description: venue,
        date,
        timeStart: parseTime(card),
        startsAt: `${date}T${parseTime(card)}:00`,
        location: [venue, "La Rioja"].filter(Boolean).join(", "),
        city,
        latitude: coords.latitude,
        longitude: coords.longitude,
        image,
        images: image ? [{ url: image }] : [],
        type: "api",
        source: "rioja_teatros",
        url,
        purchaseUrl: url,
        category_slug: category.slug,
        category_name: category.name,
        genre: category.name,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_RIOJA_EVENTS);
};

const fetchWithCache = async ({ key, url, parser, label }) => {
  const cached = caches.get(key);
  if (cached?.events?.length && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return cached.events;
  }
  if (pending.has(key)) return pending.get(key);

  const request = (async () => {
    const response = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": "GoPlan/1.0" },
    });

    if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);

    const html = await response.text();
    const events = parser(html, url);
    caches.set(key, { events, updatedAt: Date.now() });
    console.log(`${label}: ${events.length} eventos actualizados`);
    return events;
  })()
    .catch((error) => {
      console.warn(`${label} no disponible:`, error.message);
      return cached?.events || [];
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
};

const fetchCastillaManchaAgendaEvents = () =>
  fetchWithCache({
    key: "clm",
    url: "https://agendacultural.castillalamancha.es/",
    parser: parseClmEvents,
    label: "Castilla-La Mancha Agenda",
  });

const fetchPamplonaAgendaEvents = () =>
  fetchWithCache({
    key: "pamplona",
    url: "https://www.pamplona.es/actualidad/eventos",
    parser: parsePamplonaEvents,
    label: "Pamplona Agenda",
  });

const fetchRiojaTeatrosEvents = () =>
  fetchWithCache({
    key: "rioja",
    url: "https://redteatros.larioja.org/programacion/",
    parser: parseRiojaEvents,
    label: "Red Teatros La Rioja",
  });

const warmCastillaManchaAgendaCache = async () => {
  try {
    await fetchCastillaManchaAgendaEvents();
  } catch {}
};

const warmPamplonaAgendaCache = async () => {
  try {
    await fetchPamplonaAgendaEvents();
  } catch {}
};

const warmRiojaTeatrosCache = async () => {
  try {
    await fetchRiojaTeatrosEvents();
  } catch {}
};

export {
  fetchCastillaManchaAgendaEvents,
  fetchPamplonaAgendaEvents,
  fetchRiojaTeatrosEvents,
  warmCastillaManchaAgendaCache,
  warmPamplonaAgendaCache,
  warmRiojaTeatrosCache,
};
