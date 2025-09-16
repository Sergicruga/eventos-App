import { Platform } from "react-native";

const API_URL = Platform.select({
  android: "http://10.0.2.2:4000",  // emulador Android
  ios: "http://localhost:4000",      // simulador iOS
  default: "http://localhost:4000",  // Expo Go web/dispositivo: cámbialo por tu IP local si usas físico
});

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
