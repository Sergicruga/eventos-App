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
export async function joinEventApi({ userId, eventId }) {
  const r = await fetch(`${API_URL}/attendees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || "Error al apuntarse al evento");
  }
  return r.json();
}

export async function leaveEventApi({ userId, eventId }) {
  const r = await fetch(`${API_URL}/attendees`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || "Error al dejar de asistir al evento");
  }
  return r.json();
}
