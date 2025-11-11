import React, { useContext, createContext, useState, useEffect, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { AuthContext } from "./context/AuthContext";
import { API_URL } from './api/config';
import { getFavoriteIds } from './api/favorites';
import { attend as apiAttend, unattend as apiUnattend } from './api/attendees';
import { pickAndPersistImage } from './utils/pickAndPersistImage';

export const EventContext = createContext();

// ========= Utils =========
const isNumericId = (v) =>
  typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v));

const externalIdFrom = (ev) => {
  const ext = ev?.externalId ?? ev?.tm_id ?? ev?.sourceId ?? null;
  if (ext) return String(ext);
  if (ev?.id && !isNumericId(ev.id)) return String(ev.id);
  return null;
};

const parseJsonSafe = async (res) => {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
};

async function safeFetch(url, options = {}, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(t);
  }
}

const dbIdFrom = (id) => (isNumericId(id) ? Number(id) : null);
const isLocalUri = (uri) => typeof uri === 'string' && uri.startsWith('file://');

const DEFAULT_EVENT_IMAGE = "https://via.placeholder.com/800x450.png?text=Evento";

const BASE_EVENTS_KEY = 'eventos_guardados';
const BASE_FAVORITES_KEY = 'favoritos_eventos_ids';
const BASE_FAVORITES_MAP_KEY = 'favoritos_eventos_map';
const EVENT_IMAGE_OVERRIDES_KEY = 'event_image_overrides'; // global (por dispositivo)

const storageKey = (base, uid) => `${base}:${uid ?? 'guest'}`;

// ========= Fecha / futuros =========
const toLocalMidnightMs = (d) => {
  if (!d) return NaN;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day, 0, 0, 0, 0).getTime();
  }
  const t = new Date(d).getTime();
  if (Number.isNaN(t)) return NaN;
  const dt = new Date(t);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0).getTime();
};

const todayLocalMidnightMs = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
};

const isUpcoming = (dateStr) => {
  const eventMs = toLocalMidnightMs(dateStr);
  const todayMs = todayLocalMidnightMs();
  return !Number.isNaN(eventMs) && eventMs >= todayMs;
};

// ========= Resolver por external_id =========
async function findByExternalId(extId, token) {
  if (!extId) return null;
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const urls = [
    `${base}/events/by-external/${encodeURIComponent(extId)}`,
    `${base}/api/events/by-external/${encodeURIComponent(extId)}`,
    `${base}/v1/events/by-external/${encodeURIComponent(extId)}`,
  ];
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  for (const url of urls) {
    try {
      const res = await safeFetch(url, { headers }, { timeoutMs: 10000 });
      if (!res.ok) continue;
      const json = await parseJsonSafe(res);
      const id = json?.id ?? json?.data?.id ?? null;
      if (id != null) return String(id);
    } catch {}
  }
  return null;
}

// Crear/actualizar evento externo y devolver id interno
async function ensureEventOnServer(ev, token) {
  if (!ev) return null;
  if (isNumericId(ev.id)) return String(ev.id);

  const external_id = externalIdFrom(ev);
  const payload = {
    title: ev.title ?? '',
    description: ev.description ?? '',
    location: ev.location ?? '',
    event_at: ev.date ?? ev.event_at ?? null,
    image: ev.image ?? null,
    latitude: ev.latitude ?? null,
    longitude: ev.longitude ?? null,
    type: ev.type || 'api',
    source: ev.source || 'ticketmaster',
    external_id,
    url: ev.url || ev.purchaseUrl || ev.externalUrl || ev.buyUrl || null,
  };

  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const importUrls = [
    `${base}/events/import-external`,
    `${base}/api/events/import-external`,
    `${base}/v1/events/import-external`,
  ];
  for (const url of importUrls) {
    try {
      const res = await safeFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) }, { timeoutMs: 12000 });
      if (res.status === 409 && external_id) {
        const id = await findByExternalId(external_id, token);
        if (id) return id;
      }
      const json = await parseJsonSafe(res);
      const id = json?.id ?? json?.data?.id ?? null;
      if (res.ok && id != null) return String(id);
    } catch {}
  }

  const createUrls = [
    `${base}/events`,
    `${base}/api/events`,
    `${base}/v1/events`,
  ];
  for (const url of createUrls) {
    try {
      const res = await safeFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) }, { timeoutMs: 12000 });
      if (res.status === 409 && external_id) {
        const id = await findByExternalId(external_id, token);
        if (id) return id;
      }
      const json = await parseJsonSafe(res);
      const id = json?.id ?? json?.data?.id ?? null;
      if (res.ok && id != null) return String(id);
    } catch {}
  }

  return await findByExternalId(external_id, token);
}

// Intentos de actualización (PATCH/PUT/POST _method)
const attemptsFor = (base, id, basePayload, payloadWithId, headers) => {
  const urls = [
    `${base}/events/${id}`, `${base}/event/${id}`, `${base}/events/update/${id}`, `${base}/event/update/${id}`,
    `${base}/events`, `${base}/event`,
    `${base}/api/events/${id}`, `${base}/api/event/${id}`, `${base}/api/events/update/${id}`, `${base}/api/event/update/${id}`,
    `${base}/api/events`, `${base}/api/event`,
    `${base}/v1/events/${id}`, `${base}/v1/event/${id}`, `${base}/v1/events/update/${id}`, `${base}/v1/event/update/${id}`,
    `${base}/v1/events`, `${base}/v1/event`,
  ];

  const attempts = [];
  for (const u of urls) {
    if (u.endsWith(`/${id}`)) {
      attempts.push({ method: 'PATCH', url: u, body: basePayload });
      attempts.push({ method: 'PUT',   url: u, body: basePayload });
      attempts.push({ method: 'POST',  url: `${u}?_method=PUT`,   body: basePayload });
      attempts.push({ method: 'POST',  url: `${u}?_method=PATCH`, body: basePayload });
    } else {
      attempts.push({ method: 'PUT',   url: u, body: { ...payloadWithId } });
      attempts.push({ method: 'POST',  url: `${u}?_method=PUT`,   body: { ...payloadWithId } });
      attempts.push({ method: 'POST',  url: `${u}?_method=PATCH`, body: { ...payloadWithId } });
    }
  }
  const seen = new Set();
  return attempts.filter(a => {
    const key = `${a.method} ${a.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(a => ({ ...a, headers }));
};

// Obtener evento por id (verificación tras update)
async function fetchEventById(id, token) {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const urls = [
    `${base}/events/${id}`, `${base}/event/${id}`,
    `${base}/api/events/${id}`, `${base}/api/event/${id}`,
    `${base}/v1/events/${id}`, `${base}/v1/event/${id}`,
  ];
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  for (const url of urls) {
    try {
      const res = await safeFetch(url, { headers }, { timeoutMs: 10000 });
      if (!res.ok) continue;
      const json = await parseJsonSafe(res);
      if (json && typeof json === 'object') return json;
    } catch {}
  }
  return null;
}

export function EventProvider({ children }) {
  // ===== Usuario / auth =====
  const [user, setUser] = useState({ name: 'Usuario', email: '' });
  const auth = AuthContext ? useContext(AuthContext) : null;
  const effectiveUser = auth?.user ?? user;
  const authToken = auth?.token ?? null;
  const uid = auth?.user?.id ?? null;

  // ===== Estado principal =====
  const [events, setEvents] = useState([]);

  // Formulario
  const [formEvent, setFormEvent] = useState({
    title: '',
    date: '',
    location: '',
    description: '',
    image: null,
    type: 'local',
    latitude: null,
    longitude: null,
  });

  // Ubicación
  const [coords, setCoords] = useState(null);
  const [city, setCity] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  // Favoritos
  const [favorites, setFavorites] = useState([]);
  const [favoriteItems, setFavoriteItems] = useState({});

  // Overrides locales de imagen (globales)
  const [imageOverrides, setImageOverrides] = useState({});
  const [overridesReady, setOverridesReady] = useState(false);

  // ===== Overrides (global) =====
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(EVENT_IMAGE_OVERRIDES_KEY);
        if (raw) setImageOverrides(JSON.parse(raw));
      } catch {} finally {
        setOverridesReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(EVENT_IMAGE_OVERRIDES_KEY, JSON.stringify(imageOverrides)).catch(() => {});
  }, [imageOverrides]);

  // ===== Ubicación (una vez) =====
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
        setCoords(c);
        try {
          const places = await Location.reverseGeocodeAsync(c);
          const first = places?.[0];
          const cityName = first?.city || first?.subregion || first?.region || null;
          setCity(cityName);
        } catch {}
      } finally {
        setLocLoading(false);
      }
    })();
  }, []);

  // ===== Favoritos por usuario =====
  useEffect(() => {
    (async () => {
      setFavorites([]);
      setFavoriteItems({});

      try {
        const favKey = storageKey(BASE_FAVORITES_KEY, uid);
        const favMapKey = storageKey(BASE_FAVORITES_MAP_KEY, uid);
        const [favIds, favMap] = await Promise.all([
          AsyncStorage.getItem(favKey),
          AsyncStorage.getItem(favMapKey),
        ]);
        if (favIds) setFavorites(JSON.parse(favIds));
        if (favMap) setFavoriteItems(JSON.parse(favMap));
      } catch {}

      if (!uid) return;
      try {
        const serverIds = await getFavoriteIds(uid);
        const serverAsStrings = serverIds.map(String);
        const local = await AsyncStorage.getItem(storageKey(BASE_FAVORITES_KEY, uid))
          .then(v => (v ? JSON.parse(v) : []))
          .catch(() => []);
        const localNonDb = local.filter((fid) => !isNumericId(fid));
        const merged = Array.from(new Set([...serverAsStrings, ...localNonDb]));
        setFavorites(merged);
      } catch (e) {
        console.warn('No se pudieron cargar favoritos del servidor:', e?.message);
      }
    })();
  }, [uid]);

  useEffect(() => {
    AsyncStorage.setItem(storageKey(BASE_FAVORITES_KEY, uid), JSON.stringify(favorites)).catch(() => {});
  }, [favorites, uid]);

  useEffect(() => {
    AsyncStorage.setItem(storageKey(BASE_FAVORITES_MAP_KEY, uid), JSON.stringify(favoriteItems)).catch(() => {});
  }, [favoriteItems, uid]);

  // ===== Cargar eventos al cambiar usuario (clave del bug) =====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Limpiar para no ver datos del usuario anterior
      setEvents([]);

      // Backend del usuario actual
      try {
        const url = `${API_URL}/events${uid ? `?userId=${uid}` : ''}`;
        const res = await safeFetch(url, {}, { timeoutMs: 12000 });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        const mapped = (data || []).map(ev => {
          const rawEventAt = ev.event_at ?? null;
          const rawStartsAt = ev.starts_at ?? ev.startsAt ?? rawEventAt ?? null;
          const inferredTime =
            ev.time_start ??
            ev.timeStart ??
            (rawStartsAt && rawStartsAt.length >= 16 ? rawStartsAt.slice(11, 16) : null) ??
            (rawEventAt && rawEventAt.length >= 16 ? rawEventAt.slice(11, 16) : null);

          return {
            id: String(ev.id),
            title: ev.title,
            description: ev.description ?? '',
            date: rawEventAt?.slice(0, 10) ?? '',              // conservamos la fecha (YYYY-MM-DD)
            timeStart: inferredTime || null,                    // NUEVO: hora HH:MM
            startsAt: rawStartsAt || null,                      // NUEVO: ISO completo si existe
            location: ev.location ?? '',
            type: ev.type || 'local',
            image: (ev.image && String(ev.image).trim() !== "") ? ev.image : null,
            latitude: ev.latitude != null ? Number(ev.latitude) : null,
            longitude: ev.longitude != null ? Number(ev.longitude) : null,
            createdById: ev.created_by != null ? Number(ev.created_by) : null,
            createdBy: ev.created_by_name || 'Desconocido',
            isAttending: Boolean(ev.is_attending),
            attendeesCount: Number(ev.attendees_count ?? 0),
            asistentes: [],
          };
        });

        if (!cancelled) {
          setEvents(mapped);
          AsyncStorage.setItem(storageKey(BASE_EVENTS_KEY, uid), JSON.stringify(mapped)).catch(() => {});
        }
        return;
      } catch {}

      // Fallback caché local por usuario
      try {
        const savedEvents = await AsyncStorage.getItem(storageKey(BASE_EVENTS_KEY, uid));
        if (savedEvents && !cancelled) {
          const arr = JSON.parse(savedEvents);
          arr.forEach(ev => {
            if (ev.latitude != null) ev.latitude = Number(ev.latitude);
            if (ev.longitude != null) ev.longitude = Number(ev.longitude);
            ev.image = ev.image ?? ev.imageUrl ?? ev.imageUri ?? null;
            ev.type = ev.type || 'local';
          });
          setEvents(arr);
        }
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [uid, authToken]);

  // Persistir eventos por-usuario
  useEffect(() => {
    AsyncStorage.setItem(storageKey(BASE_EVENTS_KEY, uid), JSON.stringify(events)).catch(() => {});
  }, [events, uid]);

  // ===== Helpers =====
  const normalizeEvent = (ev) => ({
    ...ev,
    image: ev.image ?? ev.imageUrl ?? ev.imageUri ?? null,
  });

  const isMine = (ev) => {
    if (ev?.createdById && effectiveUser?.id) return String(ev.createdById) === String(effectiveUser.id);
    if (ev?.createdBy && user?.name) {
      return ev.createdBy.trim().toLowerCase() === user.name.trim().toLowerCase();
    }
    return false;
  };

  const getEventImageSource = (img) => {
    if (
      !img ||
      img === '/assets/iconoApp.png' ||
      img === 'assets/iconoApp.png' ||
      img === 'iconoApp.png' ||
      img.startsWith('https://placehold.co/') ||
      img.startsWith('https://via.placeholder.com/')
    ) {
      return require('../assets/iconoApp.png');
    }
    if (typeof img === 'string' && img.startsWith('/uploads/')) {
      return { uri: `${API_URL}${img}` };
    }
    return { uri: img };
  };

  const getEffectiveEventImage = (eventId, serverImage) => {
    const over = imageOverrides?.[String(eventId)];
    return over ?? serverImage ?? null;
  };

  const toPatchPayload = (ev) => {
    const payload = {
      title: ev.title ?? '',
      description: ev.description ?? '',
      event_at: ev.date ?? '',
      location: ev.location ?? '',
      type: ev.type || 'local',
      latitude: ev.latitude ?? null,
      longitude: ev.longitude ?? null,
    };
    // NUEVO: incluir hora y startsAt si están
    if (ev.timeStart) payload.time_start = ev.timeStart;
    if (ev.startsAt) payload.starts_at = ev.startsAt;
    if (ev.image && !isLocalUri(ev.image) && String(ev.image).trim() !== '') {
      payload.image = ev.image;
    }
    return payload;
  };

  const mergeEventById = (list, u) => {
    const idx = list.findIndex(e => String(e.id) === String(u.id));
    if (idx === -1) return [u, ...list];
    const prevEv = list[idx];
    const next = [...list];
    next[idx] = { ...prevEv, ...u, asistentes: u.asistentes ?? prevEv.asistentes ?? [] };
    return next;
  };

  // ===== Form: pick image =====
  const pickImageForForm = async () => {
    try {
      const localUri = await pickAndPersistImage();
      if (localUri) {
        setFormEvent(prev => ({ ...prev, image: localUri }));
        return localUri;
      }
      return null;
    } catch {
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
      return null;
    }
  };

  // ===== Crear =====
  const addEvent = async (event) => {
    const eventMs = Date.parse(event.date);
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (Number.isNaN(eventMs) || eventMs < todayMid) {
      Alert.alert('Fecha inválida', 'No puedes crear un evento con una fecha pasada.');
      return;
    }

    try {
      const payload = {
        title: event.title,
        description: event.description ?? '',
        event_at: event.date,                  // compatibilidad existente
        time_start: event.timeStart ?? '',      // NUEVO
        starts_at: event.startsAt ?? null,      // NUEVO (ISO completo)
        location: event.location ?? '',
        type: event.type || 'local',
        image: (event.image && !isLocalUri(event.image) && event.image.trim() !== "") ? event.image : "",
        latitude: event.latitude ?? null,
        longitude: event.longitude ?? null,
        created_by: effectiveUser?.id ?? null,
      };

      const res = await safeFetch(`${API_URL}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(payload),
      }, { timeoutMs: 12000 });

      const raw = await res.text();
      let saved = null;
      try { saved = raw ? JSON.parse(raw) : null; } catch {}

      if (!res.ok) {
        const msg = (saved && (saved.error || saved.message)) || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!saved || typeof saved !== 'object') {
        throw new Error('Respuesta del backend vacía o no-JSON');
      }

      const mapped = {
        id: String(saved.id),
        title: saved.title,
        description: saved.description ?? '',
        date: saved.event_at?.slice(0, 10) ?? event.date,
        timeStart:
          saved.time_start ??
          saved.timeStart ??
          (saved.starts_at ? saved.starts_at.slice(11,16) : null) ??
          (saved.event_at && saved.event_at.length >=16 ? saved.event_at.slice(11,16) : (event.timeStart || null)),
        startsAt: saved.starts_at ?? saved.startsAt ?? saved.event_at ?? event.startsAt ?? null,
        location: saved.location ?? '',
        type: saved.type || 'local',
        image:
          (saved.image && String(saved.image).trim() !== "" ? saved.image : null) ||
          (event.image && String(event.image).trim() !== "" ? event.image : null) ||
          DEFAULT_EVENT_IMAGE,
        latitude: saved.latitude != null ? Number(saved.latitude) : (event.latitude ?? null),
        longitude: saved.longitude != null ? Number(saved.longitude) : (event.longitude ?? null),
        createdById: saved?.created_by != null ? Number(saved.created_by) : (effectiveUser?.id ?? null),
        createdBy: saved?.created_by_name ?? effectiveUser?.name ?? user.name,
        asistentes: [],
        isAttending: false,
        attendeesCount: Number(saved?.attendees_count ?? 0),
      };

      if (event.image && isLocalUri(event.image)) {
        try {
          const ext = event.image.split('.').pop()?.toLowerCase() || 'jpg';
          const dir = FileSystem.documentDirectory + 'events/';
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
          const dest = `${dir}event_${saved.id}.${ext}`;
          await FileSystem.copyAsync({ from: event.image, to: dest });

          setImageOverrides(prev => ({ ...prev, [String(saved.id)]: dest }));
          const current = await AsyncStorage.getItem(EVENT_IMAGE_OVERRIDES_KEY).then(v => (v ? JSON.parse(v) : {})).catch(() => ({}));
          current[String(saved.id)] = dest;
          await AsyncStorage.setItem(EVENT_IMAGE_OVERRIDES_KEY, JSON.stringify(current));

          mapped.image = dest;
        } catch (err) {
          console.warn('No se pudo copiar la imagen local del evento:', err?.message);
        }
      }

      setEvents(prev => [mapped, ...prev]);
      return mapped;

    } catch (e) {
      console.warn('Fallo backend, guardando localmente:', e.message);
      const local = {
        ...event,
        id: Date.now().toString(),
        type: event.type || 'local',
        image: event.image || DEFAULT_EVENT_IMAGE,
        createdBy: user.name,
        asistentes: [],
        isAttending: false,
        attendeesCount: 0,
      };
      setEvents(prev => [local, ...prev]);
      return local;
    }
  };

  const createEvent = async () => {
    const e = await addEvent(formEvent);
    if (e) {
      setFormEvent({
        title: '',
        date: '',
        location: '',
        description: '',
        image: null,
        type: 'local',
        latitude: null,
        longitude: null,
      });
    }
    return e;
  };

  // ===== Editar =====
  const updateEvent = async (updatedEvent) => {
    const t = Date.parse(updatedEvent.date);
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (Number.isNaN(t) || t < todayMid) {
      Alert.alert('Fecha inválida', 'No puedes poner una fecha anterior a hoy.');
      return null;
    }

    const u = normalizeEvent(updatedEvent);
    // Aseguramos mantener los campos de hora si existen
    if (!u.timeStart && u.startsAt && u.startsAt.length >= 16) {
      u.timeStart = u.startsAt.slice(11,16);
    }
    const prevSnapshot = events;

    const optimistic = (() => {
      const existing = events.find(e => String(e.id) === String(u.id));
      const merged = {
        ...(existing || {}),
        ...u,
        createdBy: u.createdBy ?? existing?.createdBy ?? (user?.name ?? 'Usuario'),
        createdById: u.createdById ?? existing?.createdById ?? (effectiveUser?.id ?? null),
        type: u.type || existing?.type || 'local',
        asistentes: u.asistentes ?? existing?.asistentes ?? [],
      };
      return merged;
    })();

    setEvents(prev => mergeEventById(prev, optimistic));
    try {
      await AsyncStorage.setItem(storageKey(BASE_EVENTS_KEY, uid), JSON.stringify(mergeEventById(prevSnapshot, optimistic)));
    } catch {}

    const dbId = dbIdFrom(u.id);
    if (dbId == null) {
      return optimistic;
    }

    const basePayload = toPatchPayload(u);
    const payloadWithId = { id: dbId, ...basePayload };
    const headers = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
    const attempts = attemptsFor(base, dbId, basePayload, payloadWithId, headers);

    const tryAll = async () => {
      let lastRes = null;
      for (const a of attempts) {
        try {
          const res = await safeFetch(a.url, { method: a.method, headers: a.headers, body: JSON.stringify(a.body) }, { timeoutMs: 12000 });
          let snippet = '';
          try { const txt = await res.text(); snippet = txt ? txt.slice(0, 120) : ''; } catch {}

          if (res.ok || res.status === 204) {
            if (snippet && !snippet.startsWith('<!DOCTYPE')) {
              try {
                const json = JSON.parse(snippet);
                return { ok: true, status: res.status, _json: json };
              } catch {}
            }
            return { ok: true, status: res.status, _json: null };
          }

          lastRes = { ok: false, status: res.status, snippet };
          const cannotMethod = /Cannot\s+(PATCH|PUT|POST)/i.test(snippet);
          if (!(res.status === 404 || res.status === 405 || cannotMethod)) {
            return lastRes;
          }
        } catch {
          lastRes = null;
        }
      }
      return lastRes;
    };

    try {
      const result = await tryAll();

      if (!result) throw new Error('No se pudo contactar con el servidor para actualizar.');

      if (result.status === 204 || (result.ok && !result._json)) {
        const verified = await fetchEventById(dbId, authToken);
        if (verified && typeof verified === 'object') {
          const fromServer = {
            id: String(verified.id ?? u.id),
            title: verified.title ?? u.title,
            description: verified.description ?? u.description ?? '',
            date: verified.event_at?.slice(0, 10) ?? u.date,
            location: verified.location ?? u.location ?? '',
            type: verified.type || u.type || 'local',
            image: (verified.image && String(verified.image).trim() !== '' ? verified.image : null)
                    ?? (u.image && String(u.image).trim() !== '' ? u.image : null),
            latitude: verified.latitude != null ? Number(verified.latitude) : (u.latitude ?? null),
            longitude: verified.longitude != null ? Number(verified.longitude) : (u.longitude ?? null),
            createdById: verified?.created_by != null ? Number(verified.created_by) : (optimistic.createdById ?? null),
            createdBy: verified?.created_by_name ?? optimistic.createdBy ?? (user?.name ?? 'Usuario'),
            isAttending: typeof verified?.is_attending === 'boolean' ? verified.is_attending : optimistic.isAttending,
            attendeesCount: Number(verified?.attendees_count ?? optimistic.attendeesCount ?? 0),
            asistentes: optimistic.asistentes ?? [],
          };
          setEvents(prev => mergeEventById(prev, fromServer));
          try {
            const latest = mergeEventById(prevSnapshot, fromServer);
            await AsyncStorage.setItem(storageKey(BASE_EVENTS_KEY, uid), JSON.stringify(latest));
          } catch {}
          return fromServer;
        }
        const serverMapped = { ...optimistic };
        setEvents(prev => mergeEventById(prev, serverMapped));
        try {
          const latest = mergeEventById(prevSnapshot, serverMapped);
          await AsyncStorage.setItem(storageKey(BASE_EVENTS_KEY, uid), JSON.stringify(latest));
        } catch {}
        return serverMapped;
      }

      if (!result.ok) {
        throw new Error(`HTTP ${result.status} ${result.snippet || ''}`.trim());
      }

      const saved = result._json;
      const serverMapped = {
        id: String(saved?.id ?? u.id),
        title: saved?.title ?? u.title,
        description: saved?.description ?? u.description ?? '',
        date: saved?.event_at?.slice(0, 10) ?? u.date,
        timeStart:
          saved?.time_start ??
          saved?.timeStart ??
          (saved?.starts_at ? saved.starts_at.slice(11,16) : null) ??
          u.timeStart ??
          (saved?.event_at && saved.event_at.length >=16 ? saved.event_at.slice(11,16) : null),
        startsAt: saved?.starts_at ?? saved?.startsAt ?? saved?.event_at ?? u.startsAt ?? null,
        location: saved?.location ?? u.location ?? '',
        type: saved?.type || u.type || 'local',
        image:
          (saved?.image && String(saved.image).trim() !== '' ? saved.image : null) ??
          (u.image && String(u.image).trim() !== '' ? u.image : null),
        latitude: saved?.latitude != null ? Number(saved.latitude) : (u.latitude ?? null),
        longitude: saved?.longitude != null ? Number(saved.longitude) : (u.longitude ?? null),
        createdById: saved?.created_by != null ? Number(saved.created_by) : (optimistic.createdById ?? null),
        createdBy: saved?.created_by_name ?? optimistic.createdBy ?? (user?.name ?? 'Usuario'),
        isAttending: typeof saved?.is_attending === 'boolean' ? saved.is_attending : optimistic.isAttending,
        attendeesCount: Number(saved?.attendees_count ?? optimistic.attendeesCount ?? 0),
        asistentes: optimistic.asistentes ?? [],
      };

      setEvents(prev => mergeEventById(prev, serverMapped));
      try {
        const latest = mergeEventById(prevSnapshot, serverMapped);
        await AsyncStorage.setItem(storageKey(BASE_EVENTS_KEY, uid), JSON.stringify(latest));
      } catch {}

      return serverMapped;
    } catch (e) {
      console.warn('updateEvent error:', e.message);
      setEvents(prevSnapshot);
      try { await AsyncStorage.setItem(storageKey(BASE_EVENTS_KEY, uid), JSON.stringify(prevSnapshot)); } catch {}
      Alert.alert('Error', e.message || 'No se pudo actualizar el evento.');
      return null;
    }
  };

  // ===== Borrar =====
  const deleteEvent = async (eventId) => {
    try {
      const dbId = dbIdFrom(eventId);
      if (dbId != null) {
        const res = await safeFetch(`${API_URL}/events/${dbId}`, { method: 'DELETE', headers: { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } }, { timeoutMs: 12000 });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          console.warn('DELETE /events failed:', res.status, txt);
        }
      }
    } catch (e) {
      console.warn('deleteEvent API error:', e.message);
    } finally {
      setEvents(prev => prev.filter(ev => String(ev.id) !== String(eventId)));
    }
  };

  // ===== Favoritos =====
  const toggleFavorite = useCallback(
    async (id, ev) => {
      const key = String(id ?? ev?.id);

      setFavorites((prev) =>
        prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      );
      setFavoriteItems((prev) => {
        const next = { ...prev };
        if (prev[key]) delete next[key];
        else next[key] = { ...ev };
        return next;
      });

      if (!uid) {
        console.warn('[fav] sin usuario → solo local');
        return;
      }

      try {
        const already = favorites.includes(key);

        if (!already) {
          let serverId = isNumericId(key) ? key : null;
          if (!serverId) {
            serverId = await ensureEventOnServer(ev, authToken);
          }
          if (serverId) {
            await fetch(`${API_URL}/users/${uid}/favorites/events`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify({ eventId: serverId }),
            });
          } else {
            console.warn('[fav] evento externo (no BD) → solo local');
          }
        } else {
          const delHeaders = { ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) };

          if (isNumericId(key)) {
            await fetch(`${API_URL}/users/${uid}/favorites/events/${key}`, {
              method: 'DELETE',
              headers: delHeaders,
            });
          } else {
            await fetch(
              `${API_URL}/users/${uid}/favorites/events/by-external/${encodeURIComponent(key)}`,
              { method: 'DELETE', headers: delHeaders }
            ).catch(() => {});
          }

          try {
            if (ev && ev.type === 'api') {
              if (isNumericId(key)) {
                await safeFetch(`${API_URL}/events/${key}`, { method: 'DELETE', headers: delHeaders }, { timeoutMs: 12000 });
              } else {
                const src = ev.source || 'ticketmaster';
                const ext = ev.externalId || key;
                const url = `${API_URL}/events/${encodeURIComponent(key)}?source=${encodeURIComponent(src)}&externalId=${encodeURIComponent(ext)}`;
                await safeFetch(url, { method: 'DELETE', headers: delHeaders }, { timeoutMs: 12000 });
              }
            }
          } catch (e) {
            console.warn('[fav] no se pudo borrar evento externo:', e?.message || e);
          }
        }
      } catch (e) {
        console.warn('[fav] sync con server falló:', e?.message || e);
      }
    },
    [favorites, uid, authToken]
  );

  // ===== Asistir / Salir =====
  const joinEvent = async (eventId) => {
    const dbId = dbIdFrom(eventId);

    setEvents(prev => prev.map(e =>
      String(e.id) === String(eventId)
        ? {
            ...e,
            isAttending: true,
            attendeesCount: (e.attendeesCount ?? 0) + 1,
            asistentes: e.asistentes?.includes(effectiveUser?.name ?? user.name)
              ? e.asistentes
              : [...(e.asistentes || []), (effectiveUser?.name ?? user.name)],
          }
        : e
    ));

    try {
      if (!uid || dbId == null) return;
      await apiAttend(uid, dbId);
    } catch (err) {
      console.warn('joinEvent persist error:', err?.message);
      setEvents(prev => prev.map(e =>
        String(e.id) === String(eventId)
          ? {
              ...e,
              isAttending: false,
              attendeesCount: Math.max(0, (e.attendeesCount ?? 1) - 1),
              asistentes: (e.asistentes || []).filter(n => n !== (effectiveUser?.name ?? user.name)),
            }
          : e
      ));
    }
  };

  const leaveEvent = async (eventId) => {
    const dbId = dbIdFrom(eventId);

    setEvents(prev => prev.map(e =>
      String(e.id) === String(eventId)
        ? {
            ...e,
            isAttending: false,
            attendeesCount: Math.max(0, (e.attendeesCount ?? 1) - 1),
            asistentes: (e.asistentes || []).filter(n => n !== (effectiveUser?.name ?? user.name)),
          }
        : e
    ));

    try {
      if (!uid || dbId == null) return;
      await apiUnattend(uid, dbId);
    } catch (err) {
      console.warn('leaveEvent persist error:', err?.message);
      setEvents(prev => prev.map(e =>
        String(e.id) === String(eventId)
          ? {
              ...e,
              isAttending: true,
              attendeesCount: (e.attendeesCount ?? 0) + 1,
              asistentes: e.asistentes?.includes(effectiveUser?.name ?? user.name)
                ? e.asistentes
                : [...(e.asistentes || []), (effectiveUser?.name ?? user.name)],
            }
          : e
      ));
    }
  };

  const isAttending = (eventId) => {
    const ev = events.find(e => String(e.id) === String(eventId));
    return !!ev?.isAttending;
  };

  const toggleAttend = async (eventId) => {
    const ev = events.find(e => String(e.id) === String(eventId));
    if (!ev) return;
    if (ev.isAttending) {
      await leaveEvent(eventId);
    } else {
      await joinEvent(eventId);
    }
  };

  // ===== Derivados =====
  const myEvents = useMemo(() => events.filter(isMine), [events, user]);
  const communityEvents = useMemo(() => events.filter(e => !isMine(e)), [events, user]);

  // Solo de hoy y futuro (para Home)
  const eventsUpcoming = useMemo(
    () => events.filter(e => isUpcoming(e.date)),
    [events]
  );

  const myUpcomingEvents = useMemo(
    () => events.filter(e => isMine(e) && isUpcoming(e.date)),
    [events, user]
  );

  const communityUpcomingEvents = useMemo(
    () => events.filter(e => !isMine(e) && isUpcoming(e.date)),
    [events, user]
  );

  return (
    <EventContext.Provider
      value={{
        // datos
        events, myEvents, communityEvents,
        eventsUpcoming, myUpcomingEvents, communityUpcomingEvents,
        // CRUD
        addEvent, createEvent, updateEvent, deleteEvent,
        // formulario
        formEvent, setFormEvent, pickImageForForm,
        // imagen
        getEventImageSource,
        getEffectiveEventImage,
        overridesReady,
        // usuario
        user, updateUser: setUser,
        // favoritos
        favorites, favoriteItems, toggleFavorite,
        // asistencia
        joinEvent, leaveEvent,
        isAttending, toggleAttend,
        // ubicación
        coords, city, locLoading,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}
