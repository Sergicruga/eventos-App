import { API_URL } from './config';

export async function attend(userId, eventId) {
  const res = await fetch(`${API_URL}/attendees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error('Error al apuntarse');
  return res.json();
}

export async function unattend(userId, eventId) {
  const res = await fetch(`${API_URL}/attendees`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error('Error al desapuntarse');
  return res.json();
}
