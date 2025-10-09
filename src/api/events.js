import { Platform } from "react-native";
import { API_URL } from '../api/config';

export async function listEvents() {
  const res = await fetch(`${API_URL}/events`);
  if (!res.ok) throw new Error("Error listando eventos");
  return res.json();
}

export async function createEvent(event) {
  // event_at debe ser YYYY-MM-DD (tu server espera event_at)
  const payload = {
    title: event.title,
    description: event.description || "",
    event_at: event.date, // asegúrate de pasar string YYYY-MM-DD desde CreateEventScreen
    location: event.location || "",
    type: event.type || "Otro",
    image: event.image || null, // si subes URL
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
  };

  const res = await fetch(`${API_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Error creando evento");
  }
  return res.json(); // retorna el evento insertado
}
export async function uploadEventPhoto(eventId, localUri) {
  const form = new FormData();
  form.append("photo", {
    uri: localUri,
    name: "event.jpg",
    type: "image/jpeg",
  });

  const res = await fetch(`${API_URL}/events/${eventId}/photo`, {
    method: "POST",
    body: form, // ¡no pongas Content-Type! RN añade boundary
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${t}`);
  }
  return res.json(); // { ok:true, image:"/uploads/events/..", event:{...} }
}
