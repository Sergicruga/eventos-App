// src/api/users.js
import { API_URL } from './config';

export async function getUser(userId) {
  const r = await fetch(`${API_URL}/users/${userId}`);
  if (!r.ok) throw new Error('Error cargando usuario');
  return r.json();
}

export async function getUserCreatedEvents(userId) {
  const r = await fetch(`${API_URL}/users/${userId}/events-created`);
  if (!r.ok) throw new Error('Error cargando mis eventos');
  return r.json();
}

// 🔹 Eventos a los que el usuario está apuntado
export async function getUserAttendingEvents(userId) {
  const r = await fetch(`${API_URL}/users/${userId}/events-attending`);
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(txt || 'Error cargando eventos a los que asistes');
  }
  return r.json();
}


export async function updateProfile(userId, { name, email }) {
  const r = await fetch(`${API_URL}/users/${userId}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt || 'Error actualizando perfil');
  }
  return r.json();
}

export async function changePassword(userId, currentPassword, newPassword) {
  const r = await fetch(`${API_URL}/users/${userId}/password`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(txt || 'Error cambiando contraseña');
  }
  return r.json();
}

export async function uploadUserPhoto(userId, uri) {
  const form = new FormData();
  form.append('photo', { uri, name: 'profile.jpg', type: 'image/jpeg' });
  const r = await fetch(`${API_URL}/users/${userId}/photo`, { method: 'POST', body: form });
  if (!r.ok) throw new Error('Error subiendo foto');
  return r.json(); // { photo: "/uploads/..." }
}
