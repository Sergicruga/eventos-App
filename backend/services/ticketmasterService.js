// services/ticketmasterService.js
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY;
const TICKETMASTER_API_URL = 'https://app.ticketmaster.com/discovery/v2/events';

/**
 * Fetch music events from Ticketmaster API
 * @param {string} city - City name (e.g., 'Madrid', 'Barcelona')
 * @param {number} size - Number of events to fetch (default: 20, max: 200)
 * @returns {Promise<Array>} Array of formatted music events
 */
async function fetchMusicEventsByCity(city = 'Madrid', size = 50) {
  if (!TICKETMASTER_API_KEY) {
    console.warn('Ticketmaster API key not configured');
    return [];
  }

  try {
    const params = new URLSearchParams({
      apikey: TICKETMASTER_API_KEY,
      city: city,
      classificationName: 'music', // Only get music events
      size: Math.min(size, 200), // Max 200 per API docs
      countryCode: 'ES', // Spain
    });

    const url = `${TICKETMASTER_API_URL}?${params}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Ticketmaster API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const events = data?._embedded?.events || [];

    // Transform Ticketmaster format to our format
    return formatTicketmasterEvents(events);
  } catch (error) {
    console.error('Error fetching Ticketmaster events:', error.message);
    return [];
  }
}

/**
 * Fetch music events for multiple cities
 */
async function fetchMusicEventsMultipleCities(cities = ['Madrid', 'Barcelona', 'Valencia'], sizePerCity = 30) {
  const promises = cities.map(city => fetchMusicEventsByCity(city, sizePerCity));
  const results = await Promise.all(promises);
  return results.flat();
}

/**
 * Transform Ticketmaster event format to match our internal format
 */
function formatTicketmasterEvents(events) {
  return events.map(event => {
    const dates = event.dates?.start;
    const eventDate = dates?.localDate || new Date().toISOString().split('T')[0];
    const eventTime = dates?.localTime || '20:00';

    // Get image
    let eventImage = null;
    if (event.images && event.images.length > 0) {
      // Find the largest image
      eventImage = event.images.reduce((max, img) =>
        (img.width || 0) > (max.width || 0) ? img : max
      ).url;
    }

    // Get venue info
    const venue = event._embedded?.venues?.[0] || {};
    const location = `${venue.name || 'Venue'}${venue.city ? ', ' + venue.city.name : ''}`;

    // Get classification (genre)
    const classifications = event.classifications || [];
    const genre = classifications[0]?.subGenre?.name ||
                  classifications[0]?.genre?.name ||
                  'Música';

    // Get URL
    const eventUrl = event.url || null;

    return {
      id: event.id, // Ticketmaster event ID
      title: event.name,
      description: event.description || `Event: ${event.name}`,
      date: eventDate,
      timeStart: eventTime,
      startsAt: `${eventDate}T${eventTime}:00`,
      location: location,
      latitude: parseFloat(venue.location?.latitude) || null,
      longitude: parseFloat(venue.location?.longitude) || null,
      image: eventImage,
      type: 'api', // Mark as external API event
      source: 'ticketmaster',
      externalId: event.id,
      tm_id: event.id,
      url: eventUrl,
      purchaseUrl: eventUrl,
      category_slug: 'musica',
      category_name: 'Música',
      genre: genre,
    };
  });
}

export {
  fetchMusicEventsByCity,
  fetchMusicEventsMultipleCities,
  formatTicketmasterEvents,
};
