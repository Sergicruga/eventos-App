# Atrapalo Event Scraper Setup Guide

## Overview
This guide explains how to set up and use web scraping to fetch events from Atrapalo (a Spanish events/entertainment website) into your Eventos App backend.

## What Was Added

### 1. **atrapaloService.js** (`backend/services/atrapaloService.js`)
- Scrapes Atrapalo using Puppeteer (headless browser)
- Supports multiple Spanish cities: Madrid, Barcelona, Valencia, Asturias, Bilbao, Sevilla, Málaga, Granada, Zaragoza, Palma
- Automatically formats events to match your internal event schema
- Handles date/time parsing from Spanish format
- Error-tolerant (returns empty array on failure)

### 2. **New Dependencies** in `package.json`
- `puppeteer@^21.6.1` - Headless Chrome browser for scraping
- `cheerio@^1.0.0-rc.12` - HTML parsing library
- `node-schedule@^2.1.1` - Cron job scheduler for periodic updates

### 3. **Integration with GET /events**
The main `/events` endpoint now:
- Fetches local events from your database
- Fetches Ticketmaster music events (as before)
- **NEW:** Fetches Atrapalo events for the user's city (if available)
- Returns all combined and merged

## Installation

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

This will install Puppeteer (⚠️ first time download is ~150-200MB).

### Step 2: (Optional) Enable Scheduled Scraping
The scheduler is commented out by default. To enable periodic Atrapalo scraping (every 3 hours):

1. Open `backend/server.js`
2. Find the `/* ATRAPALO SCHEDULER */` section (around line 85)
3. Uncomment the `schedule.scheduleJob()` block

This will cache events periodically, reducing scraping on each API request.

## How It Works

### On Each `/events` API Request (Default)
```
1. Fetch local events from PostgreSQL database
2. Fetch Ticketmaster music events (parallel)
3. Fetch Atrapalo events for user's city (parallel)
4. Return all combined (may take 5-15 seconds due to Atrapalo scraping)
```

### With Scheduler Enabled
```
- Every 3 hours: Background job scrapes Atrapalo and caches results
- On /events request: Return cached Atrapalo events (fast!)
- If cache is old: Fall back to fresh scrape
```

## City Support

Supported cities (can be expanded in `CITY_URLS` object):
```
✅ Madrid, Barcelona, Valencia (default)
✅ Asturias, Bilbao, Sevilla, Málaga, Granada, Zaragoza, Palma
```

## Frontend Integration

The Atrapalo events will be returned with:
```javascript
{
  id: "atrapalo_Madrid_0_1234567890",
  title: "Event Title",
  description: "Event details...",
  date: "2024-06-25",
  timeStart: "18:30",
  startsAt: "2024-06-25T18:30:00",
  location: "Barcelona, España",
  image: "https://...",
  source: "atrapalo",          // Identifies source
  type: "api",                 // External API event
  category_slug: "otro",       // Other category
  category_name: "Otro",
  url: "https://atrapalo.com/...",
  city: "Barcelona"
}
```

## Performance Considerations

### ⚠️ Important Notes
1. **Puppeteer is resource-intensive**: Each scrape launches a browser instance
   - Don't scrape too frequently
   - Enable scheduler for production instead of on-demand
   - Each scrape takes 5-15 seconds per city

2. **Production Deployment (Render/Heroku)**:
   - Puppeteer may not work in some free tiers
   - Consider using environment variable to disable Atrapalo on deployment:
   ```javascript
   if (process.env.SCRAPE_ATRAPALO === 'false') {
     return []; // Skip Atrapalo
   }
   ```

3. **Rate Limiting**:
   - Add delays between requests to avoid blocking
   - Respect Atrapalo's robots.txt and ToS

## Troubleshooting

### "Puppeteer: Command not found"
```bash
npm install puppeteer --save
```

### Scraping returns empty events
1. Atrapalo HTML structure may have changed
2. Update selectors in `parseEventElement()` function
3. Check browser console logs for errors

### Too slow on production
- Enable scheduler to cache events
- Increase cache interval
- Consider one-time daily scrapes instead of per-request

## Optional Enhancements

### 1. Cache Events in Database
Create a table to store Atrapalo events:
```sql
CREATE TABLE atrapalo_cache (
  id SERIAL PRIMARY KEY,
  external_id TEXT UNIQUE,
  title TEXT,
  description TEXT,
  event_at DATE,
  location TEXT,
  image TEXT,
  latitude FLOAT,
  longitude FLOAT,
  external_url TEXT,
  city TEXT,
  scraped_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Add Error Handling Middleware
```javascript
app.use((err, req, res, next) => {
  if (err.code === 'ESOCKETTIMEDOUT') {
    // Atrapalo timeout - return cached events instead
  }
});
```

### 3. Reduce Puppeteer Memory Usage
```javascript
browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage'  // For limited RAM
  ]
});
```

## Legal & Ethical Considerations

✅ **Before deploying**, make sure:
1. You've reviewed Atrapalo's `robots.txt`
2. Your scraping respects their Terms of Service
3. You're not overloading their servers
4. You implement appropriate backoff/retry logic
5. You cache results to minimize requests

## Support

If you encounter issues:
1. Check `console.log` output in server logs
2. Verify Puppeteer installation: `npx puppeteer browsers`
3. Test scraping manually in development
4. Consider implementing retry logic with exponential backoff

Happy scraping! 🎉
