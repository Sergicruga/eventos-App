// services/atrapaloService.js
import puppeteer from 'puppeteer-core';
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
  let browser = null;
  try {
    // Dynamically find Chrome from puppeteer cache
    const { execSync } = await import('child_process');
    
    let chromePath;
    try {
      // Try to find Chrome using find command
      const result = execSync('find /root/.cache/puppeteer -name chrome -type f 2>/dev/null | head -1', { encoding: 'utf8' });
      chromePath = result.trim();
    } catch (e) {
      // Fallback to common paths
      const possiblePaths = [
        '/root/.cache/puppeteer/chrome/linux-123.0.7737.56/chrome-linux/chrome',
        '/opt/render/.cache/puppeteer/chrome/linux-123.0.7737.56/chrome-linux/chrome',
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH
      ].filter(Boolean);
      chromePath = possiblePaths[0];
    }
    
    if (!chromePath) {
      throw new Error('Chrome not found');
    }
    
    console.log('✅ Using Chrome at:', chromePath);
    
    const launchOptions = {
      executablePath: chromePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    };
    
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const fullUrl = `${ATRAPALO_BASE_URL}/entradas/`;
    console.log(`Scraping Atrapalo: ${fullUrl}`);

    await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const pageTitle = await page.title();
    if (pageTitle.includes('404') || pageTitle.includes('Dónde estamos')) {
      console.warn(`⚠️ Atrapalo returned 404 for ${fullUrl}`);
      return [];
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    const content = await page.content();
    const $ = cheerio.load(content);

    let events = [];
    const selectors = ['.card', '[data-test="event-item"]', '.event-card', '.evento-item', '[class*="event"]'];

    for (const selector of selectors) {
      if (events.length === 0) {
        $(selector).each((_, element) => {
          const event = parseEventElement($, element);
          if (event && event.title) events.push(event);
        });
        if (events.length > 0) {
          console.log(`✅ Found ${events.length} events using selector: ${selector}`);
        }
      }
    }

    if (city) {
      const normalizedCity = city.toLowerCase();
      events = events.filter((event) => {
        const location = event.location?.toLowerCase() || '';
        const description = event.description?.toLowerCase() || '';
        return location.includes(normalizedCity) || description.includes(normalizedCity);
      });
    }

    console.log(`📊 Total events found from Atrapalo in ${city}: ${events.length}`);
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

    const title = $element.find('.card__text-title').first().text().trim() ||
                  $element.find('h2, h3, [class*=\"title\"]').first().text().trim() ||
                  $element.attr('title') ||
                  $element.find('a').first().text().trim();

    if (!title) return null;

    const rawDescription = $element.find('.card__text-description').first().text().trim() ||
                           $element.find('p, [class*=\"description\"]').first().text().trim() ||
                           title;

    let location = '';
    if (rawDescription.includes('·')) {
      const [cityPart] = rawDescription.split('·').map(part => part.trim());
      location = cityPart;
    } else {
      location = rawDescription;
    }

    const dateStr = $element.find('time').first().text().trim() ||
                    $element.find('[class*=\"date\"]').first().text().trim() ||
                    '';

    const imageElement = $element.find('img').first();
    let imageUrl = imageElement.attr('src') || imageElement.attr('data-src') || null;
    if (!imageUrl) {
      const bgStyle = $element.find('[class*=\"image\"]').first().attr('style') || '';
      const match = bgStyle.match(/url\(['\"]?([^'\")]+)['\"]?\)/);
      imageUrl = match ? match[1] : null;
    }

    const eventUrl = $element.find('a.card__link').first().attr('href') ||
                     $element.find('a').first().attr('href');
    const fullUrl = eventUrl
      ? eventUrl.startsWith('http')
        ? eventUrl
        : `${ATRAPALO_BASE_URL}${eventUrl}`
      : null;

    return {
      title,
      description: rawDescription,
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
