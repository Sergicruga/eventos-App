// src/db/eventsResolver.js
export async function resolveEventId(pool, { source, externalId, payload }) {
  // 1) ¿ya está enlazado?
  const rel = await pool.query(
    'SELECT event_id FROM api_events WHERE source=$1 AND external_id=$2',
    [source, externalId]
  );
  if (rel.rows.length && rel.rows[0].event_id) return rel.rows[0].event_id;

  // 2) crear events interno (ajusta nombres de columnas a tu tabla `events`)
  const {
    title, description, image, eventAt,
    venueName, city, country, latitude, longitude, url
  } = payload ?? {};

  const ins = await pool.query(
    `INSERT INTO events (title, description, image, event_at, venue_name, city, country, latitude, longitude, url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [title, description, image, eventAt, venueName, city, country, latitude, longitude, url]
  );
  const eventId = ins.rows[0].id;

  // 3) enlazar en api_events
  await pool.query(
    `UPDATE api_events
       SET event_id = $1, title = COALESCE(title,$2),
           description = COALESCE(description,$3),
           image = COALESCE(image,$4),
           event_at = COALESCE(event_at,$5),
           venue_name = COALESCE(venue_name,$6),
           city = COALESCE(city,$7),
           country = COALESCE(country,$8),
           latitude = COALESCE(latitude,$9),
           longitude = COALESCE(longitude,$10),
           url = COALESCE(url,$11)
     WHERE source=$12 AND external_id=$13`,
    [eventId, title, description, image, eventAt, venueName, city, country, latitude, longitude, url, source, externalId]
  );

  return eventId;
}

// util para detectar numérico
export const isNumericId = (v) => /^\d+$/.test(String(v ?? ''));
