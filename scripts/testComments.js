const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const API_BASE = 'https://eventos-app-oy65.onrender.com';

async function test() {
  // Replace these with an actual externalId that your instance uses for ticketmaster events.
  const externalId = 'tm-TEST';
  const source = 'ticketmaster';

  // Try to resolve by calling GET /events/by-external/:externalId
  console.log('Resolving external id:', externalId);
  try {
    const r = await fetch(`${API_BASE}/events/by-external/${encodeURIComponent(externalId)}`);
    console.log('GET /events/by-external status', r.status);
    const j = await r.text();
    console.log('Response:', j);
  } catch (e) {
    console.error('resolve error', e);
  }

  // Try posting a comment to the external id path (should include source & externalId)
  try {
    const postUrl = `${API_BASE}/events/${externalId}/comments?source=${encodeURIComponent(source)}&externalId=${encodeURIComponent(externalId)}`;
    console.log('POST comment to', postUrl);
    const body = {
      userId: 1,
      comment: 'Test comment from script',
      title: 'Test TM Event',
      description: 'Created by test script',
      image: null,
      event_at: '2026-09-01',
      venue_name: 'Test Venue',
      city: 'Test City',
      country: 'Testland',
      latitude: 0,
      longitude: 0,
      url: 'https://example.com',
      source,
      externalId,
    };

    const res = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log('POST status', res.status);
    console.log(await res.text());
  } catch (e) {
    console.error('post error', e);
  }

  // Try fetching comments
  try {
    const getUrl = `${API_BASE}/events/${externalId}/comments?source=${encodeURIComponent(source)}&externalId=${encodeURIComponent(externalId)}`;
    console.log('GET comments from', getUrl);
    const r2 = await fetch(getUrl);
    console.log('GET status', r2.status);
    console.log(await r2.text());
  } catch (e) {
    console.error('get comments error', e);
  }
}

test();
