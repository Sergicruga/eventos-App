// services/ticketmasterService.js
const TICKETMASTER_API_URL = "https://app.ticketmaster.com/discovery/v2/events";

const CACHE_TTL_MS = Number(
  process.env.TICKETMASTER_CACHE_TTL_MS || 3 * 60 * 60 * 1000,
);
const DEFAULT_EVENTS_PER_CITY = Number(
  process.env.TICKETMASTER_EVENTS_PER_CITY || 80,
);
const cache = new Map();

function getApiKey() {
  return process.env.TICKETMASTER_API_KEY;
}

const categoryFromClassification = (classifications = []) => {
  const primary =
    classifications.find((item) => item?.primary) || classifications[0] || {};

  const segment = String(primary.segment?.name || "").toLowerCase();
  const genre = String(primary.genre?.name || primary.subGenre?.name || "").toLowerCase();
  const type = String(primary.type?.name || "").toLowerCase();
  const text = `${segment} ${genre} ${type}`;

  if (/music|música|musica|concert|concierto|festival/.test(text)) {
    return { slug: "musica", name: "Música" };
  }
  if (/sport|deporte|football|soccer|basket|tennis|motor|running/.test(text)) {
    return { slug: "deportes", name: "Deportes" };
  }
  if (
    /arts|theatre|theater|teatro|dance|danza|comedy|comedia|circus|circo|opera|ópera|musical/.test(
      text,
    )
  ) {
    return { slug: "arte", name: "Arte" };
  }
  if (/film|movie|cinema|cine/.test(text)) {
    return { slug: "cine", name: "Cine" };
  }

  return { slug: "otro", name: "Otro" };
};

/**
 * Fetch general events from Ticketmaster API.
 *
 * Important: we intentionally do NOT send classificationName=music.
 * Without that filter, Ticketmaster can return music, sports, arts/theatre,
 * film, family and miscellaneous events from all available Ticketmaster sources.
 */
async function fetchTicketmasterEventsByCity(city = "Madrid", size = DEFAULT_EVENTS_PER_CITY) {
  const TICKETMASTER_API_KEY = getApiKey();
  if (!TICKETMASTER_API_KEY) {
    console.warn("Ticketmaster API key not configured");
    return [];
  }

  const cacheKey = `${String(city).trim().toLowerCase()}:${size}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return cached.events;
  }

  try {
    const params = new URLSearchParams({
      apikey: TICKETMASTER_API_KEY,
      city,
      size: String(Math.min(size, 200)),
      countryCode: "ES",
      sort: "date,asc",
      locale: "es-es",
    });

    const url = `${TICKETMASTER_API_URL}?${params}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error(`Ticketmaster API error: ${response.status}`);
      return cached?.events || [];
    }

    const data = await response.json();
    const events = data?._embedded?.events || [];
    const formatted = formatTicketmasterEvents(events);

    cache.set(cacheKey, { events: formatted, updatedAt: Date.now() });
    console.log(`Ticketmaster: ${formatted.length} eventos actualizados para ${city}`);
    return formatted;
  } catch (error) {
    console.error("Error fetching Ticketmaster events:", error.message);
    return cached?.events || [];
  }
}

/**
 * Backwards-compatible name used by server.js.
 * It now fetches all Ticketmaster event types, not only music.
 */
async function fetchMusicEventsByCity(city = "Madrid", size = DEFAULT_EVENTS_PER_CITY) {
  return fetchTicketmasterEventsByCity(city, size);
}

/**
 * Backwards-compatible name used by server.js.
 */
async function fetchMusicEventsMultipleCities(
  cities = ["Madrid", "Barcelona", "Valencia"],
  sizePerCity = DEFAULT_EVENTS_PER_CITY,
) {
  const uniqueCities = [...new Set(cities.map((city) => String(city).trim()).filter(Boolean))];
  const results = [];

  for (const city of uniqueCities) {
    results.push(...(await fetchTicketmasterEventsByCity(city, sizePerCity)));
  }

  return results;
}

/**
 * Transform Ticketmaster event format to match our internal format.
 */
function formatTicketmasterEvents(events) {
  return events.map((event) => {
    const dates = event.dates?.start;
    const eventDate = dates?.localDate || new Date().toISOString().split("T")[0];
    const eventTime = dates?.localTime || "20:00";

    let eventImage = null;
    if (event.images && event.images.length > 0) {
      eventImage = event.images.reduce((max, img) =>
        (img.width || 0) > (max.width || 0) ? img : max,
      ).url;
    }

    const venue = event._embedded?.venues?.[0] || {};
    const location = `${venue.name || "Venue"}${
      venue.city ? ", " + venue.city.name : ""
    }`;

    const classifications = event.classifications || [];
    const genre =
      classifications[0]?.subGenre?.name ||
      classifications[0]?.genre?.name ||
      classifications[0]?.segment?.name ||
      "Evento";
    const category = categoryFromClassification(classifications);

    const eventUrl = event.url || null;

    return {
      id: event.id,
      title: event.name,
      description: event.description || event.info || `Evento: ${event.name}`,
      date: eventDate,
      timeStart: eventTime,
      startsAt: `${eventDate}T${eventTime}:00`,
      location,
      city: venue.city?.name || null,
      latitude: parseFloat(venue.location?.latitude) || null,
      longitude: parseFloat(venue.location?.longitude) || null,
      image: eventImage,
      images: Array.isArray(event.images)
        ? event.images.map((image) => ({ url: image.url })).filter((image) => image.url)
        : [],
      type: "api",
      source: "ticketmaster",
      externalId: event.id,
      tm_id: event.id,
      url: eventUrl,
      purchaseUrl: eventUrl,
      category_slug: category.slug,
      category_name: category.name,
      genre,
    };
  });
}

export {
  fetchTicketmasterEventsByCity,
  fetchMusicEventsByCity,
  fetchMusicEventsMultipleCities,
  formatTicketmasterEvents,
};
