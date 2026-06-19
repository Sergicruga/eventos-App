import puppeteer from "puppeteer";

const ATRAPALO_BASE_URL = "https://www.atrapalo.com";
const DEFAULT_CITIES = ["Madrid", "Barcelona", "Valencia"];
const CACHE_TTL_MS = Number(process.env.ATRAPALO_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const MAX_EVENTS_PER_CITY = Number(process.env.ATRAPALO_MAX_EVENTS_PER_CITY || 40);

const CITY_SLUGS = {
  Madrid: "madrid",
  Barcelona: "barcelona",
  Valencia: "valencia",
  Asturias: "asturias",
  Bilbao: "bilbao",
  Sevilla: "sevilla",
  Málaga: "malaga",
  Granada: "granada",
  Zaragoza: "zaragoza",
  Palma: "palma-de-mallorca",
};

const cache = new Map();
const pending = new Map();

const normalizeCity = (city = "") => {
  const requested = String(city).trim().toLowerCase();
  return (
    Object.keys(CITY_SLUGS).find(
      (candidate) => candidate.toLowerCase() === requested,
    ) || null
  );
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const eventIdFromUrl = (url = "") => {
  const match = String(url).match(/_e(\d+)\/?$/);
  return match ? match[1] : null;
};

const absoluteUrl = (url) => {
  if (!url) return null;
  try {
    return new URL(url, ATRAPALO_BASE_URL).href;
  } catch {
    return null;
  }
};

const categorySlug = (category = "") => {
  const value = String(category).toLowerCase();
  if (/m[uú]sica|concierto|festival|tributo/.test(value)) return "musica";
  if (/deporte/.test(value)) return "deportes";
  if (/cine/.test(value)) return "cine";
  if (
    /teatro|danza|mon[oó]logo|musical|magia|circo|museo|exposici|comedia|drama|impro|zarzuela|cabaret/.test(
      value,
    )
  ) {
    return "arte";
  }
  if (/conferencia|formaci[oó]n|taller/.test(value)) return "educacion";
  return "otro";
};

const parseStartDate = (value) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { date: raw, timeStart: "20:00", startsAt: `${raw}T20:00:00` };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    date: parsed.toISOString().slice(0, 10),
    timeStart: parsed.toTimeString().slice(0, 5),
    startsAt: parsed.toISOString(),
  };
};

const parseStructuredEvent = (jsonLd, sourceUrl, requestedCity) => {
  const nodes = asArray(jsonLd).flatMap(asArray);
  const event = nodes.find((node) =>
    asArray(node?.["@type"]).some((type) => /Event$/i.test(String(type))),
  );
  const product = nodes.find((node) =>
    asArray(node?.["@type"]).map(String).includes("Product"),
  );
  if (!event && !product) return null;

  const offers = asArray(event?.offers || product?.offers);
  const firstOffer = offers[0] || {};
  const startDate =
    event?.startDate ||
    firstOffer.availabilityStarts ||
    firstOffer.validFrom ||
    null;
  if (!startDate) return null;

  const start = parseStartDate(startDate);
  if (!start) return null;

  const location = event?.location || {};
  const address = location?.address || {};
  const city =
    address.addressLocality ||
    address.addressRegion ||
    requestedCity ||
    "";
  const venue = location?.name || "";
  const coordinates = location?.geo || {};
  const category =
    firstOffer.category ||
    event?.eventType ||
    product?.category ||
    "Espectáculos";
  const externalId = eventIdFromUrl(sourceUrl);
  const title = event?.name || product?.name;
  if (!externalId || !title) return null;

  const images = asArray(event?.image || product?.image);
  const image = typeof images[0] === "string" ? images[0] : images[0]?.url;
  return {
    id: `atrapalo_${externalId}`,
    externalId: `atrapalo_${externalId}`,
    title,
    description:
      event?.description ||
      product?.description ||
      `Entradas para ${title} en Atrápalo`,
    date: start.date,
    timeStart: start.timeStart,
    startsAt: start.startsAt,
    location: [venue, city].filter(Boolean).join(", "),
    city,
    latitude: Number(coordinates.latitude) || null,
    longitude: Number(coordinates.longitude) || null,
    image: absoluteUrl(image),
    images: images
      .map((item) => absoluteUrl(typeof item === "string" ? item : item?.url))
      .filter(Boolean)
      .map((url) => ({ url })),
    type: "api",
    source: "atrapalo",
    url: sourceUrl,
    purchaseUrl: sourceUrl,
    category_slug: categorySlug(category),
    category_name: category,
    genre: category,
    price: firstOffer.price ? Number(firstOffer.price) : null,
    currency: firstOffer.priceCurrency || null,
  };
};

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_PATH ||
      undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
    ],
  });
}

async function preparePage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  );
  await page.setExtraHTTPHeaders({ "Accept-Language": "es-ES,es;q=0.9" });
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (["font", "media"].includes(request.resourceType())) request.abort();
    else request.continue();
  });
  return page;
}

async function waitForAtrapalo(page) {
  await page.waitForFunction(
    () => document.title !== "Client Challenge",
    { timeout: 30_000 },
  );
}

async function getCityEvents(page, city) {
  const url = `${ATRAPALO_BASE_URL}/entradas/${CITY_SLUGS[city]}/`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await waitForAtrapalo(page);
  await page.waitForSelector('script[type="application/ld+json"]', {
    timeout: 20_000,
  });
  const scripts = await page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => script.textContent,
    ),
  );

  const events = [];
  const seen = new Set();
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script);
      const roots = asArray(parsed);
      const listItems = roots.flatMap((root) =>
        root?.["@type"] === "ItemList" ? asArray(root.itemListElement) : [],
      );

      for (const listItem of listItems) {
        const rawEvent = listItem?.item || listItem;
        const eventUrl = absoluteUrl(rawEvent?.url);
        const event = parseStructuredEvent(rawEvent, eventUrl, city);
        if (!event || seen.has(event.externalId)) continue;
        seen.add(event.externalId);
        events.push(event);
        if (events.length >= MAX_EVENTS_PER_CITY) return events;
      }
    } catch {
      // Ignore malformed or unrelated JSON-LD blocks.
    }
  }
  return events;
}

async function scrapeCity(city) {
  const browser = await launchBrowser();
  try {
    const page = await preparePage(browser);
    return await getCityEvents(page, city);
  } finally {
    await browser.close();
  }
}

async function refreshCity(city) {
  if (pending.has(city)) return pending.get(city);
  const job = scrapeCity(city)
    .then((events) => {
      cache.set(city, { events, updatedAt: Date.now() });
      console.log(`Atrápalo: ${events.length} eventos actualizados para ${city}`);
      return events;
    })
    .catch((error) => {
      console.warn(`Atrápalo no disponible para ${city}:`, error.message);
      return cache.get(city)?.events || [];
    })
    .finally(() => pending.delete(city));
  pending.set(city, job);
  return job;
}

async function fetchAtrapaloEventsByCity(city = "Madrid") {
  const supportedCity = normalizeCity(city);
  if (!supportedCity || process.env.DISABLE_ATRAPALO === "true") return [];

  const cached = cache.get(supportedCity);
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    return cached.events;
  }
  if (cached) {
    void refreshCity(supportedCity);
    return cached.events;
  }
  return refreshCity(supportedCity);
}

async function fetchAtrapaloEventsMultipleCities(cities = DEFAULT_CITIES) {
  const uniqueCities = [...new Set(cities.map(normalizeCity).filter(Boolean))];
  const results = [];
  for (const city of uniqueCities) {
    results.push(...(await fetchAtrapaloEventsByCity(city)));
  }
  return results;
}

async function warmAtrapaloCache(cities = DEFAULT_CITIES) {
  if (process.env.DISABLE_ATRAPALO === "true") return;
  for (const city of cities) {
    await refreshCity(city);
  }
}

export {
  CITY_SLUGS,
  fetchAtrapaloEventsByCity,
  fetchAtrapaloEventsMultipleCities,
  parseStructuredEvent,
  warmAtrapaloCache,
};
