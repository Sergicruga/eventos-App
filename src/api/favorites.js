import { Platform } from "react-native";
const API_URL = Platform.select({
  android: "http://10.0.2.2:4000",
  ios: "http://localhost:4000",
  default: "http://localhost:4000",
});

export const getFavoriteIds = async (userId) => {
  const res = await fetch(`${API_URL}/users/${userId}/favorites`);
  if (!res.ok) throw new Error("Error obteniendo favoritos");
  return res.json(); // [event_id,...] (IDs numéricos de BD)
};

export const getFavoriteEvents = async (userId) => {
  const res = await fetch(`${API_URL}/users/${userId}/favorites/events`);
  if (!res.ok) throw new Error("Error obteniendo eventos favoritos");
  return res.json(); // eventos completos
};

export const addFavorite = async (userId, eventId) => {
  const res = await fetch(`${API_URL}/favorites`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error("Error añadiendo favorito");
  return res.json();
};

export const removeFavorite = async (userId, eventId) => {
  const res = await fetch(`${API_URL}/favorites`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, eventId }),
  });
  if (!res.ok) throw new Error("Error quitando favorito");
  return res.json();
};
