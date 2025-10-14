// api/events.js
import { API_URL } from '../api/config';

/** Util: parsea JSON sin romper si el cuerpo viene vacío o malformado */
async function parseJsonSafe(res) {
  try {
    const text = await res.text();
    if (!text || text.trim().length === 0) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Util: fetch con timeout (ms) */
async function fetchWithTimeout(input, init = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function listEvents() {
  const res = await fetchWithTimeout(`${API_URL}/events`, {}, 12000);
  if (!res.ok) throw new Error("Error listando eventos");
  // Soportar respuesta sin cuerpo
  const json = await parseJsonSafe(res);
  return json ?? [];
}

export async function createEvent(event) {
  // event_at debe ser YYYY-MM-DD (tu server espera event_at)
  const payload = {
    title: event.title,
    description: event.description || "",
    event_at: event.date, // YYYY-MM-DD
    location: event.location || "",
    type: event.type || "Otro",
    image: event.image || null,
    latitude: event.latitude ?? null,
    longitude: event.longitude ?? null,
  };

  const res = await fetchWithTimeout(`${API_URL}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, 15000);

  if (!res.ok) {
    // intenta leer JSON y si no, texto
    let msg = "";
    try {
      const j = await res.json();
      msg = j?.error || JSON.stringify(j);
    } catch {
      try {
        msg = await res.text();
      } catch {}
    }
    throw new Error(msg || "Error creando evento");
  }

  const json = await parseJsonSafe(res);
  // Si el backend devuelve 204/empty, devolvemos al menos lo creado (sin id)
  return json ?? payload;
}

/**
 * Actualiza parcialmente un evento.
 * - Usa PATCH /events/:id (si tu servidor devuelve 204, se maneja bien)
 * - Mapea "date" -> "event_at" si viene en los datos
 * - Solo envía claves definidas (evita mandar undefined)
 *
 * @param {string|number} eventId
 * @param {object} data  { title?, description?, date?, location?, type?, image?, latitude?, longitude? }
 * @returns {Promise<object>} evento actualizado (o merge razonable si no hay cuerpo)
 */
export async function updateEvent(eventId, data = {}, { timeoutMs = 15000 } = {}) {
  if (eventId == null) {
    throw new Error("updateEvent: eventId es requerido");
  }

  // Construir payload solo con claves definidas
  const map = {
    title: data.title,
    description: data.description,
    event_at: typeof data.date !== "undefined" ? data.date : undefined, // map date -> event_at
    location: data.location,
    type: data.type,
    image: data.image,
    latitude: data.latitude,
    longitude: data.longitude,
  };

  const payload = Object.fromEntries(
    Object.entries(map).filter(([, v]) => typeof v !== "undefined")
  );

  if (Object.keys(payload).length === 0) {
    throw new Error("No hay campos para actualizar");
  }

  const res = await fetchWithTimeout(`${API_URL}/events/${eventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, timeoutMs);

  // 204 No Content -> no intentes parsear JSON
  if (res.status === 204) {
    return { id: eventId, ...payload };
  }

  if (!res.ok) {
    // intenta parsear JSON, si falla saca texto
    let msg = "";
    try {
      const j = await res.json();
      msg = j?.error || JSON.stringify(j);
    } catch {
      try {
        msg = await res.text();
      } catch {}
    }
    throw new Error(`Error al actualizar evento: ${res.status} ${msg || ""}`.trim());
  }

  const json = await parseJsonSafe(res);
  // Si el backend devuelve vacío, devolvemos al menos el payload fusionado
  return json ?? { id: eventId, ...payload };
}

export async function uploadEventPhoto(eventId, localUri) {
  const form = new FormData();
  form.append("photo", {
    uri: localUri,
    name: "event.jpg",
    type: "image/jpeg",
  });

  const res = await fetchWithTimeout(`${API_URL}/events/${eventId}/photo`, {
    method: "POST",
    body: form, // ¡no pongas Content-Type! RN añade boundary
  }, 20000);

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${t}`);
  }
  const json = await parseJsonSafe(res);
  return json ?? { ok: true, event: { id: eventId }, image: null };
}

export async function deleteEvent(id) {
  const res = await fetch(`${API_URL}/api/events/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'No se pudo eliminar el evento');
  }
  return true;
}
