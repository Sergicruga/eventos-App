import { Platform } from "react-native";
const API_URL = Platform.select({
  android: "http://10.0.2.2:4000",
  ios: "http://localhost:4000",
  default: "http://localhost:4000",
});

export const attend = async (userId, eventId) => {
  const res = await fetch(`${API_URL}/attendees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error("Error al apuntarse");
  return res.json();
};

export const unattend = async (userId, eventId) => {
  const res = await fetch(`${API_URL}/attendees`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error("Error al desapuntarse");
  return res.json();
};

export const listAttendees = async (eventId) => {
  const res = await fetch(`${API_URL}/events/${eventId}/attendees`);
  if (!res.ok) throw new Error("Error listando asistentes");
  return res.json(); // [{id,name,photo},...]
};

export const checkAttending = async (eventId, userId) => {
  const res = await fetch(`${API_URL}/events/${eventId}/attendees/${userId}`);
  if (!res.ok) throw new Error("Error comprobando asistencia");
  return res.json(); // { attending: boolean }
};
