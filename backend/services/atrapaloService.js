// services/atrapaloService.js
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

const ATRAPALO_BASE_URL = 'https://www.atrapalo.com';
const CITY_URLS = {
  'Madrid': '/eventos/madrid',
  'Barcelona': '/eventos/barcelona',
  'Valencia': '/eventos/valencia',
  'Asturias': '/eventos/asturias',
  'Bilbao': '/eventos/bilbao',
  'Sevilla': '/eventos/sevilla',
  'Málaga': '/eventos/malaga',
  'Granada': '/eventos/granada',
  'Zaragoza': '/eventos/zaragoza',
  'Palma': '/eventos/palma'
};

/**
 * Scrape Atrapalo events for a specific city
 * @param {string} city - City name (e.g., 'Madrid', 'Barcelona')
 * @returns {Promise<Array>} Array of formatted events
 */
async function fetchAtrapaloEventsByCity(city = 'Madrid') {
  const urlPath = CITY_URLS[city];
  if (!urlPath) {
    console.warn(`City ${city} not supported in Atrapalo scraper`);
    return [];
  }

  let browser = null;
  try {
    // Launch Puppeteer with headless mode
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    
    // Set user agent to avoid blocking
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );

    const fullUrl = `${ATRAPALO_BASE_URL}${urlPath}`;
    console.log(`Scraping Atrapalo: ${fullUrl}`);

    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for event items to load
    await page.waitForSelector('[data-test="event-item"], .event-card, .evento-item', { timeout: 5000 }).catch(() => {
      console.warn(`No event selector found for ${city}`);
    });

    // Get page content
    const content = await page.content();
    const $ = cheerio.load(content);

    // Try multiple selectors to find events
    let events = [];
    
    // Selector 1: data-test attribute
    $('[data-test="event-item"]').each((_, element) => {
      const event = parseEventElement($, element);
      if (event) events.push(event);
    });

    // If no events found, try other selectors
    if (events.length === 0) {
      $('.event-card, .evento-item, [class*="event"]').each((_, element) => {
        const event = parseEventElement($, element);
        if (event && event.title) events.push(event);
      });
    }

    console.log(`Found ${events.length} events from Atrapalo in ${city}`);
    
    // Format events to match our internal schema
    return formatAtrapaloEvents(events, city);

  } catch (error) {
    console.error(`Error scraping Atrapalo events for ${city}:`, error.message);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Parse individual event element from Atrapalo
 */
function parseEventElement($, element) {
  try {
    const $element = $(element);
    
    // Try to extract title
    let title = $element.find('h2, h3, [class*="title"]').first().text().trim() ||
                $element.attr('title') ||
                $element.find('a').first().text().trim();

    if (!title) return null;

    // Extract other fields
    const description = $element.find('p, [class*="description"]').first().text().trim() || title;
    const location = $element.find('[class*="location"], [class*="venue"], span').text().trim() || '';
    
    // Extract date
    let dateStr = $element.find('[class*="date"], time').first().text().trim() ||
                  $element.find('[class*="fecha"]').first().text().trim();
    
    // Extract image
    const imageUrl = $element.find('img').first().attr('src') || 
                     $element.find('[class*="image"]').css('background-image').match(/url\(['"]?([^'")]+)['"]?\)/)?.[1] || null;
    
    // Extract URL
    const eventUrl = $element.find('a').first().attr('href');
    const fullUrl = eventUrl && eventUrl.startsWith('http') ? eventUrl : (eventUrl ? `${ATRAPALO_BASE_URL}${eventUrl}` : null);

    return {
      title,
      description,
      location,
      dateStr,
      imageUrl,
      url: fullUrl
    };
  } catch (error) {
    console.error('Error parsing event element:', error.message);
    return null;
  }
}

/**
 * Format Atrapalo events to match our internal format
 */
function formatAtrapaloEvents(events, city = 'Madrid') {
  return events.filter(event => event && event.title).map((event, index) => {
    // Parse date string (Atrapalo often shows "Tuesday, 25 de Junio" or similar)
    const { date, time } = parseDateString(event.dateStr);

    return {
      id: `atrapalo_${city}_${index}_${Date.now()}`,
      title: event.title,
      description: event.description || `Event: ${event.title}`,
      date: date,
      timeStart: time,
      startsAt: `${date}T${time}:00`,
      location: `${event.location || city}, España`,
      image: event.imageUrl,
      type: 'api',
      source: 'atrapalo',
      externalId: `atrapalo_${index}_${Date.now()}`,
      url: event.url,
      purchaseUrl: event.url,
      category_slug: 'otro', // Atrapalo has mixed event types
      category_name: 'Otro',
      city: city
    };
  });
}

/**
 * Parse date string from Atrapalo format
 * Handles formats like "Monday, 25 de Junio" or "25/06/2024" or "25 Junio"
 */
function parseDateString(dateStr = '') {
  const today = new Date();
  let date = today.toISOString().split('T')[0];
  let time = '18:00'; // Default time

  if (!dateStr) {
    return { date, time };
  }

  // Extract time if present (e.g., "18:30" or "6:30 PM")
  const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})(?:\s*(AM|PM|am|pm))?/);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2];
    const meridiem = timeMatch[3];

    if (meridiem && meridiem.toUpperCase() === 'PM' && hours !== 12) {
      hours += 12;
    } else if (meridiem && meridiem.toUpperCase() === 'AM' && hours === 12) {
      hours = 0;
    }

    time = `${String(hours).padStart(2, '0')}:${minutes}`;
  }

  // Try to parse Spanish month names
  const monthMap = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5,
    'junio': 6, 'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10,
    'noviembre': 11, 'diciembre': 12
  };

  // Extract day and month
  const dayMatch = dateStr.match(/(\d{1,2})/);
  let monthName = '';
  for (const [name] of Object.entries(monthMap)) {
    if (dateStr.toLowerCase().includes(name)) {
      monthName = name;
      break;
    }
  }

  if (dayMatch && monthName) {
    const day = parseInt(dayMatch[1]);
    const month = monthMap[monthName];
    const year = today.getFullYear();
    
    // Format as YYYY-MM-DD
    date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return { date, time };
}

/**
 * Fetch Atrapalo events for multiple cities
 */
async function fetchAtrapaloEventsMultipleCities(cities = ['Madrid', 'Barcelona', 'Valencia'], sizePerCity = 30) {
  const promises = cities.map(city => fetchAtrapaloEventsByCity(city));
  const results = await Promise.all(promises);
  return results.flat();
}

export {
  fetchAtrapaloEventsByCity,
  fetchAtrapaloEventsMultipleCities,
  formatAtrapaloEvents,
  CITY_URLS
};
