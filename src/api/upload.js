// /src/api/upload.js
import { API_URL } from '../api/config';

export async function uploadEventPhoto(localUri) {
  const form = new FormData();
  form.append('photo', {
    uri: localUri,
    name: 'event.jpg',
    type: 'image/jpeg',
  });

  const res = await fetch(`${API_URL}/events/upload`, {
    method: 'POST',
    // OJO: no pongas 'Content-Type' manualmente con FormData en RN
    body: form,
  });

  if (!res.ok) throw new Error('Error subiendo imagen');
  const data = await res.json();
  // Preferimos guardar la ruta relativa para que funcione toImageSource
  // y se convierta con API_URL: "/uploads/xxxx.jpg"
  return data.path || data.url;
}
