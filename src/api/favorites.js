const API_URL = 'http://192.168.1.37:4000';

export async function getFavoriteIds(userId) {
  const res = await fetch(`${API_URL}/users/${userId}/favorites`);
  if (!res.ok) throw new Error('Error obteniendo favoritos');
  return res.json();
}

export async function addFavorite(userId, eventId) {
  const res = await fetch(`${API_URL}/favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error('Error añadiendo favorito');
  return res.json();
}

export async function removeFavorite(userId, eventId) {
  const res = await fetch(`${API_URL}/favorites`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error('Error quitando favorito');
  return res.json();
}
