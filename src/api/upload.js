// /src/api/upload.js
import { API_URL } from '../api/config';

// Usa un nombre único para cada imagen subida
export async function uploadEventImage(localUri, oldImagePath = '') {
  const uniqueName = `event_${Date.now()}.jpg`;
  const form = new FormData();
  form.append('image', {
    uri: localUri,
    name: uniqueName,
    type: 'image/jpeg',
  });
  if (oldImagePath) {
    form.append('oldImagePath', oldImagePath);
  }

  const res = await fetch(`${API_URL}/events/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error('Error subiendo imagen');
  const data = await res.json();
  return data.path || data.url;
}
