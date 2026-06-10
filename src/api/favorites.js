import { API_URL } from '../config';

export function normalizeFavoriteEventId(eventId) {
  if (eventId == null) return null;
  const normalized = String(eventId).trim();
  return normalized ? normalized : null;
}

export async function getFavoriteIds(userId) {
  const res = await fetch(`${API_URL}/users/${userId}/favorites`);
  if (!res.ok) throw new Error('Error obteniendo favoritos');
  return res.json();
}

export async function addFavorite(userId, eventId) {
  const normalizedId = normalizeFavoriteEventId(eventId);
  const payload = { userId, eventId: normalizedId };
  const res = await fetch(`${API_URL}/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Error añadiendo favorito');
  return res.json();
}

export async function removeFavorite(userId, eventId) {
  const normalizedId = normalizeFavoriteEventId(eventId);
  const payload = { userId, eventId: normalizedId };
  const res = await fetch(`${API_URL}/favorites`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Error quitando favorito');
  return res.json();
}
