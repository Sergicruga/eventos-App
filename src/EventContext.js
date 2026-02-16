import React, {
  useContext,
  createContext,
  useState,
  useEffect,
  useMemo,
} from 'react';

// Proveer un valor por defecto mínimo para evitar errores si se consume fuera del Provider
export const EventContext = createContext({ events: [] });

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { AuthContext } from './context/AuthContext';
import { API_URL } from './api/config';
import { getFavoriteIds } from './api/favorites';
import { attend as apiAttend, unattend as apiUnattend } from './api/attendees';
import { pickAndPersistImage } from './utils/pickAndPersistImage';

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

const DEFAULT_EVENT_IMAGE = 'https://via.placeholder.com/800x450.png?text=Evento';

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
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
};

const isUpcoming = (dateStr) => {
  const eventMs = toLocalMidnightMs(dateStr);
  const todayMs = todayLocalMidnightMs();
  return !Number.isNaN(eventMs) && eventMs >= todayMs;
};

// 🔧 Normalizar hora a formato "HH:MM" (acepta "HH:MM" y "HH:MM:SS")
const normalizeTimeString = (time) => {
  if (!time) return null;
  const str = String(time).trim();
  const m = str.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = m[1];
  const mm = m[2];
  return `${hh}:${mm}`;
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
      const res = await safeFetch(
        url,
        { method: 'POST', headers, body: JSON.stringify(payload) },
        { timeoutMs: 12000 }
      );
      if (res.status === 409 && external_id) {
        const id = await findByExternalId(external_id, token);
        if (id) return id;
      }
      const json = await parseJsonSafe(res);
      const id = json?.id ?? json?.data?.id ?? null;
      if (res.ok && id != null) return String(id);
    } catch {}
  }

  const createUrls = [`${base}/events`, `${base}/api/events`, `${base}/v1/events`];
  for (const url of createUrls) {
    try {
      const res = await safeFetch(
        url,
        { method: 'POST', headers, body: JSON.stringify(payload) },
        { timeoutMs: 12000 }
      );
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
    `${base}/events/${id}`,
    `${base}/event/${id}`,
    `${base}/events/update/${id}`,
    `${base}/event/update/${id}`,
    `${base}/events`,
    `${base}/event`,
    `${base}/api/events/${id}`,
    `${base}/api/event/${id}`,
    `${base}/api/events/update/${id}`,
    `${base}/api/event/update/${id}`,
    `${base}/api/events`,
    `${base}/api/event`,
    `${base}/v1/events/${id}`,
    `${base}/v1/event/${id}`,
    `${base}/v1/events/update/${id}`,
    `${base}/v1/event/update/${id}`,
    `${base}/v1/events`,
    `${base}/v1/event`,
  ];

  const attempts = [];
  for (const u of urls) {
    if (u.endsWith(`/${id}`)) {
      attempts.push({ method: 'PATCH', url: u, body: basePayload });
      attempts.push({ method: 'PUT', url: u, body: basePayload });
      attempts.push({ method: 'POST', url: `${u}?_method=PUT`, body: basePayload });
      attempts.push({ method: 'POST', url: `${u}?_method=PATCH`, body: basePayload });
    } else {
      attempts.push({ method: 'PUT', url: u, body: { ...payloadWithId } });
      attempts.push({
        method: 'POST',
        url: `${u}?_method=PUT`,
        body: { ...payloadWithId },
      });
      attempts.push({
        method: 'POST',
        url: `${u}?_method=PATCH`,
        body: { ...payloadWithId },
      });
    }
  }
  const seen = new Set();
  return attempts
    .filter((a) => {
      const key = `${a.method} ${a.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((a) => ({ ...a, headers }));
};

// Obtener evento por id (verificación tras update)
async function fetchEventById(id, token) {
  const base = API_URL.endsWith('/') ? API_URL.slice(0, -1) : API_URL;
  const urls = [
    `${base}/events/${id}`,
    `${base}/event/${id}`,
    `${base}/api/events/${id}`,
    `${base}/api/event/${id}`,
    `${base}/v1/events/${id}`,
    `${base}/v1/event/${id}`,
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
      } catch {
      } finally {
        setOverridesReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(
      EVENT_IMAGE_OVERRIDES_KEY,
      JSON.stringify(imageOverrides)
    ).catch(() => {});
  }, [imageOverrides]);

  // ===== Ubicación (una vez) =====
  useEffect(() => {
    (async () => {
      try {
        const { status } =
          await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setLocLoading(false);
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const c = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
        setCoords(c);
        try {
          const places = await Location.reverseGeocodeAsync(c);
          const first = places?.[0];
          const cityName =
            first?.city ||
            first?.subregion ||
            first?.region ||
            null;
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
        const local = await AsyncStorage.getItem(
          storageKey(BASE_FAVORITES_KEY, uid)
        )
          .then((v) => (v ? JSON.parse(v) : []))
          .catch(() => []);
        const localNonDb = local.filter((fid) => !isNumericId(fid));
        const merged = Array.from(
          new Set([...serverAsStrings, ...localNonDb])
        );
        setFavorites(merged);
      } catch (e) {
        console.warn(
          'No se pudieron cargar favoritos del servidor:',
          e?.message
        );
      }
    })();
  }, [uid]);

  useEffect(() => {
    AsyncStorage.setItem(
      storageKey(BASE_FAVORITES_KEY, uid),
      JSON.stringify(favorites)
    ).catch(() => {});
  }, [favorites, uid]);

  useEffect(() => {
    AsyncStorage.setItem(
      storageKey(BASE_FAVORITES_MAP_KEY, uid),
      JSON.stringify(favoriteItems)
    ).catch(() => {});
  }, [favoriteItems, uid]);

  // ---------- Normalizar antes de guardar en AsyncStorage ----------
  const normalizeForStorage = (arr = []) =>
    (arr || []).map((ev) => ({
      ...ev,
      id: String(ev.id),
      timeStart:
        typeof ev.timeStart === 'string' && ev.timeStart
          ? ev.timeStart
          : ev.timeStart ?? null,
      startsAt:
        typeof ev.startsAt === 'string' && ev.startsAt
          ? ev.startsAt
          : ev.startsAt ?? null,
      date: ev.date ?? '',
      category_slug: ev.category_slug ?? null,
      category_name: ev.category_name ?? null,
      latitude: ev.latitude != null ? Number(ev.latitude) : null,
      longitude: ev.longitude != null ? Number(ev.longitude) : null,
      image: ev.image ?? null,
    }));

  // ===== Cargar eventos al cambiar usuario =====
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) caché
      try {
        const cachedRaw = await AsyncStorage.getItem(
          storageKey(BASE_EVENTS_KEY, uid)
        );
        const cached = cachedRaw ? JSON.parse(cachedRaw) : [];
        if (!cancelled && cached?.length) {
          cached.forEach((ev) => {
            if (ev.latitude != null) ev.latitude = Number(ev.latitude);
            if (ev.longitude != null) ev.longitude = Number(ev.longitude);
            ev.image = ev.image ?? ev.imageUrl ?? ev.imageUri ?? null;
            ev.type = ev.type || 'local';
          });
          setEvents(cached);
        }
      } catch {}

      // 2) server
      try {
        const url = `${API_URL}/events${
          uid ? `?userId=${uid}` : ''
        }`;
        const res = await safeFetch(
          url,
          {},
          { timeoutMs: 12000 }
        );
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        let mapped = (data || []).map((ev) => {
          const rawEventAt = ev.event_at ?? null;
          const yyyyMmDd = rawEventAt
            ? String(rawEventAt).slice(0, 10)
            : ev.date
            ? String(ev.date).slice(0, 10)
            : '';

          // 🔧 Aceptar time_start tanto "HH:MM" como "HH:MM:SS"
          const rawTime = ev.time_start ?? ev.timeStart ?? null;
          const normTime = normalizeTimeString(rawTime);

          const rawStartsAtServer =
            ev.starts_at ?? ev.startsAt ?? null;

          // 🔧 Si servidor no manda starts_at, lo derivamos de date + hora
          let derivedStartsAt = rawStartsAtServer;
          if (!derivedStartsAt && yyyyMmDd && normTime) {
            derivedStartsAt = `${yyyyMmDd}T${normTime}:00`;
          }

          // 🔧 Hora inferida en formato "HH:MM"
          const inferredTime =
            normTime ??
            (derivedStartsAt && derivedStartsAt.length >= 16
              ? derivedStartsAt.slice(11, 16)
              : null);

          return {
            id: String(ev.id),
            title: ev.title,
            description: ev.description ?? '',
            date: yyyyMmDd || '',
            timeStart: inferredTime || null,
            startsAt: derivedStartsAt || null,
            location: ev.location ?? '',
            type: ev.type || 'local',
            category_slug: ev.category_slug || null,  // ← ADD THIS
            category_name: ev.category_name || null,  // ← ADD THIS
            image:
              ev.image && String(ev.image).trim() !== ''
                ? ev.image
                : null,
            latitude:
              ev.latitude != null ? Number(ev.latitude) : null,
            longitude:
              ev.longitude != null ? Number(ev.longitude) : null,
            createdById:
              ev.created_by != null ? Number(ev.created_by) : null,
            createdBy: ev.created_by_name || 'Desconocido',
            isAttending: Boolean(ev.is_attending),
            attendeesCount: Number(ev.attendees_count ?? 0),
            asistentes: [],
          };
        });

        // merge con caché para no perder hora
        try {
          const prevRaw = await AsyncStorage.getItem(
            storageKey(BASE_EVENTS_KEY, uid)
          );
          const prevArr = prevRaw ? JSON.parse(prevRaw) : [];
          const prevMap = Object.fromEntries(
            prevArr.map((p) => [String(p.id), p])
          );

          mapped = mapped.map((e) => {
            const prev = prevMap[e.id];
            if (!prev) return e;

            const serverHasTime =
              (typeof e.timeStart === 'string' &&
                e.timeStart.length >= 4) ||
              (typeof e.startsAt === 'string' &&
                e.startsAt.length >= 16);

            let timeStart = e.timeStart || null;
            let startsAt = e.startsAt || null;

            if (!serverHasTime) {
              if (!timeStart && prev.timeStart)
                timeStart = prev.timeStart;
              if (!startsAt && prev.startsAt)
                startsAt = prev.startsAt;
              if (
                !timeStart &&
                typeof startsAt === 'string' &&
                startsAt.length >= 16
              ) {
                timeStart = startsAt.slice(11, 16);
              }
            }

            let date = e.date || '';
            if (!serverHasTime && prev.date) {
              date = prev.date;
            } else if (!date && prev.date) {
              date = prev.date;
            }

            return { ...e, timeStart, startsAt, date };
          });
        } catch {}

        // mantener locales no en server
        try {
          const prevRawAll = await AsyncStorage.getItem(
            storageKey(BASE_EVENTS_KEY, uid)
          );
          const prevArrAll = prevRawAll
            ? JSON.parse(prevRawAll)
            : [];
          const mappedIds = new Set(
            mapped.map((m) => String(m.id))
          );
          const localsToKeep = prevArrAll.filter(
            (p) => !mappedIds.has(String(p.id))
          );
          if (localsToKeep.length > 0) {
            const normalizedLocals = localsToKeep.map((p) => ({
              ...p,
              id: String(p.id),
              latitude:
                p.latitude != null ? Number(p.latitude) : null,
              longitude:
                p.longitude != null ? Number(p.longitude) : null,
              type: p.type || 'local',
            }));
            mapped = [...normalizedLocals, ...mapped];
          }
        } catch {}

        if (!cancelled) {
          setEvents(mapped);
          try {
            const normalized = normalizeForStorage(mapped);
            const key = storageKey(BASE_EVENTS_KEY, uid);
            await AsyncStorage.setItem(
              key,
              JSON.stringify(normalized)
            );
          } catch {}
        }
        return;
      } catch {
        // si falla server, se queda la caché
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, authToken]);

  // Persistir eventos por-usuario ante cambios
  useEffect(() => {
    try {
      const sanitized = normalizeForStorage(events);
      const key = storageKey(BASE_EVENTS_KEY, uid);
      AsyncStorage.setItem(key, JSON.stringify(sanitized)).catch(
        () => {}
      );
    } catch {
      /* ignore */
    }
  }, [events, uid]);

  // ===== Helpers =====
  const normalizeEvent = (ev) => ({
    ...ev,
    image: ev.image ?? ev.imageUrl ?? ev.imageUri ?? null,
  });

  const isMine = (ev) => {
    if (ev?.createdById && effectiveUser?.id)
      return String(ev.createdById) === String(effectiveUser.id);
    if (ev?.createdBy && user?.name) {
      return (
        ev.createdBy.trim().toLowerCase() ===
        user.name.trim().toLowerCase()
      );
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

    // 🔧 Enviar siempre hora normalizada "HH:MM" si existe
    if (ev.timeStart) {
      const norm = normalizeTimeString(ev.timeStart) ?? ev.timeStart;
      payload.time_start = norm;
    }
    if (ev.startsAt) payload.starts_at = ev.startsAt;

    if (
      ev.image &&
      !isLocalUri(ev.image) &&
      String(ev.image).trim() !== ''
    ) {
      payload.image = ev.image;
    }
    return payload;
  };

  const mergeEventById = (list, u) => {
    const idx = list.findIndex((e) => String(e.id) === String(u.id));
    if (idx === -1) return [u, ...list];
    const prevEv = list[idx];
    const next = [...list];
    next[idx] = {
      ...prevEv,
      ...u,
      asistentes: u.asistentes ?? prevEv.asistentes ?? [],
    };
    return next;
  };

  // ===== Form: pick image =====
  const pickImageForForm = async () => {
    try {
      const localUri = await pickAndPersistImage();
      if (localUri) {
        setFormEvent((prev) => ({ ...prev, image: localUri }));
        return localUri;
      }
      return null;
    } catch {
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
      return null;
    }
  };

  // ===== Crear evento =====
  const addEvent = async (event) => {
    console.log('[addEvent] input:', {
      title: event?.title,
      date: event?.date,
      timeStart: event?.timeStart,
      startsAt: event?.startsAt,
      location: event?.location,
      latitude: event?.latitude,
      longitude: event?.longitude,
    });

    const eventMs = Date.parse(event?.date);
    const now = new Date();
    const todayMid = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    console.log(
      '[addEvent] parsedDateMs:',
      eventMs,
      'todayMid:',
      todayMid
    );

    if (Number.isNaN(eventMs) || eventMs < todayMid) {
      console.warn('[addEvent] Fecha inválida → cancelado', {
        eventDate: event?.date,
      });
      Alert.alert(
        'Fecha inválida',
        'No puedes crear un evento con una fecha pasada.'
      );
      return null;
    }

    try {
      const normTime =
        normalizeTimeString(event.timeStart) ?? event.timeStart ?? '';

      const payload = {
        title: event.title,
        description: event.description ?? '',
        event_at: event.date,
        time_start: normTime,
        starts_at: event.startsAt ?? null,
        location: event.location ?? '',
        type: event.type || 'local',
        image:
          event.image &&
          !isLocalUri(event.image) &&
          event.image.trim() !== ''
            ? event.image
            : '',
        latitude: event.latitude ?? null,
        longitude: event.longitude ?? null,
        created_by: effectiveUser?.id ?? null,
      };

      console.log('[addEvent] POST →', `${API_URL}/events`, payload);

      const res = await safeFetch(
        `${API_URL}/events`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken
              ? { Authorization: `Bearer ${authToken}` }
              : {}),
          },
          body: JSON.stringify(payload),
        },
        { timeoutMs: 12000 }
      );

      const raw = await res.text();
      console.log(
        '[addEvent] response status:',
        res.status,
        'body:',
        raw?.slice(0, 400)
      );

      let saved = null;
      try {
        saved = raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('[addEvent] JSON parse error:', e?.message);
      }

      if (!res.ok) {
        const msg =
          (saved && (saved.error || saved.message)) ||
          `HTTP ${res.status}`;
        console.warn('[addEvent] server NOT OK:', msg);
        throw new Error(msg);
      }
      if (!saved || typeof saved !== 'object') {
        console.warn('[addEvent] server empty / not JSON');
        throw new Error('Respuesta del backend vacía o no-JSON');
      }

      // 🔧 Normalizar hora que devuelve el backend
      const savedTimeRaw =
        saved.time_start ?? saved.timeStart ?? null;
      const savedTimeNorm = normalizeTimeString(savedTimeRaw);

      const mapped = {
        id: String(saved.id),
        title: saved.title,
        description: saved.description ?? '',
        date:
          event.date ??
          saved.event_at?.slice(0, 10) ??
          '',
        timeStart:
          savedTimeNorm ??
          (saved.starts_at
            ? saved.starts_at.slice(11, 16)
            : null) ??
          (event.timeStart ?? null),
        startsAt:
          saved.starts_at ??
          saved.startsAt ??
          event.startsAt ??
          null,
        location: saved.location ?? '',
        type: saved.type || 'local',
        category_slug: saved.category_slug ?? null,
        category_name: saved.category_name ?? null,
        image:
          (saved.image &&
          String(saved.image).trim() !== ''
            ? saved.image
            : null) ||
          (event.image &&
          String(event.image).trim() !== ''
            ? event.image
            : null) ||
          DEFAULT_EVENT_IMAGE,
        latitude:
          saved.latitude != null
            ? Number(saved.latitude)
            : event.latitude ?? null,
        longitude:
          saved.longitude != null
            ? Number(saved.longitude)
            : event.longitude ?? null,
        createdById:
          saved?.created_by != null
            ? Number(saved.created_by)
            : effectiveUser?.id ?? null,
        createdBy:
          saved?.created_by_name ??
          effectiveUser?.name ??
          user.name,
        asistentes: [],
        isAttending: false,
        attendeesCount: 0,
      };

      try {
        const key = storageKey(BASE_EVENTS_KEY, uid);
        const rawPrev = await AsyncStorage.getItem(key);
        const prev = rawPrev ? JSON.parse(rawPrev) : [];
        const next = mergeEventById(prev, mapped);
        setEvents(next);
        await AsyncStorage.setItem(
          key,
          JSON.stringify(normalizeForStorage(next))
        );
      } catch {}

      return mapped;
    } catch (e) {
      console.warn('[addEvent] error:', e?.message);
      Alert.alert(
        'Error al crear evento',
        e?.message ?? 'Error desconocido'
      );
      return null;
    }
  };

  // ===== EDITAR EVENTO =====
  const updateEvent = async (eventId, updated) => {
    if (!eventId) return null;

    try {
      const payload = toPatchPayload(updated);

      const res = await safeFetch(
        `${API_URL}/events/${eventId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken
              ? { Authorization: `Bearer ${authToken}` }
              : {}),
          },
          body: JSON.stringify(payload),
        },
        { timeoutMs: 12000 }
      );

      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}

      if (!res.ok) {
        throw new Error(json?.message || `HTTP ${res.status}`);
      }

      setEvents((prev) => {
        const idx = prev.findIndex(
          (e) => String(e.id) === String(eventId)
        );
        if (idx === -1) return prev;

        const prevEv = prev[idx];

        const merged = {
          ...prevEv,
          ...updated,
          id: String(eventId),
          date: updated.date ?? prevEv.date ?? '',
          timeStart:
            updated.timeStart ??
            prevEv.timeStart ??
            null,
          startsAt:
            updated.startsAt ??
            prevEv.startsAt ??
            null,
          category_slug: json?.category_slug ?? prevEv.category_slug ?? null,
          category_name: json?.category_name ?? prevEv.category_name ?? null,
        };

        const next = [...prev];
        next[idx] = merged;
        return next;
      });

      return true;
    } catch (e) {
      console.warn('[updateEvent] error:', e?.message);
      Alert.alert(
        'Error',
        e.message || 'No se pudo actualizar el evento'
      );
      return null;
    }
  };

  // ===== Unir asistentes (merge) =====
  const mergeAssistants = async (eventId, newAsistentes = []) => {
    if (!eventId) return;
    setEvents((prev) => {
      const idx = prev.findIndex(
        (e) => String(e.id) === String(eventId)
      );
      if (idx === -1) return prev;
      const ev = prev[idx];
      const merged = { ...ev, asistentes: newAsistentes };
      const next = [...prev];
      next[idx] = merged;
      return next;
    });
  };

  // ===== Asistir / no asistir (núcleo) =====
  const attend = async (eventId, attending = true) => {
    if (!eventId) return;
    if (!effectiveUser?.id) {
      Alert.alert(
        'Inicia sesión',
        'Debes iniciar sesión para apuntarte a un evento.'
      );
      return;
    }

    try {
      // Asegurarnos de tener un ID válido para el servidor
      let dbId = dbIdFrom(eventId);
      let eventObj = events.find(
        (e) => String(e.id) === String(eventId)
      );

      if (!dbId && eventObj) {
        // Evento de API: intentamos crearlo/enlazarlo en el backend
        const serverId = await ensureEventOnServer(
          eventObj,
          authToken
        );
        if (serverId) {
          dbId = Number(serverId);
          // Opcionalmente actualizamos el id en memoria
          setEvents((prev) =>
            prev.map((ev) =>
              String(ev.id) === String(eventId)
                ? { ...ev, id: String(serverId) }
                : ev
            )
          );
        }
      }

      if (!dbId) {
        Alert.alert(
          'Error',
          'No se ha podido enlazar este evento en el servidor.'
        );
        return;
      }

      const payload = {
        userId: effectiveUser.id,
        eventId: dbId,
      };

      const res = await safeFetch(
        `${API_URL}/attendees`,
        {
          method: attending ? 'POST' : 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken
              ? { Authorization: `Bearer ${authToken}` }
              : {}),
          },
          body: JSON.stringify(payload),
        },
        { timeoutMs: 12000 }
      );

      const raw = await res.text();
      console.log(
        '[attend] status:',
        res.status,
        'body:',
        raw?.slice(0, 400)
      );

      if (!res.ok) {
        console.warn(
          '[attend] server NOT OK:',
          res.status,
          raw
        );
        throw new Error(raw || `HTTP ${res.status}`);
      }

      // Actualizar estado local
      setEvents((prev) => {
        return prev.map((ev) => {
          if (
            String(ev.id) === String(eventId) ||
            (dbId &&
              isNumericId(ev.id) &&
              Number(ev.id) === dbId)
          ) {
            const prevCount = Number(ev.attendeesCount ?? 0);
            const newCount = attending
              ? prevCount + 1
              : Math.max(prevCount - 1, 0);
            return {
              ...ev,
              isAttending: attending,
              attendeesCount: newCount,
            };
          }
          return ev;
        });
      });
    } catch (e) {
      console.warn('[attend] error:', e?.message);
      Alert.alert(
        'Error al actualizar asistencia',
        e?.message ?? 'Error desconocido'
      );
    }
  };

  // ===== Wrappers que usa la UI: joinEvent / leaveEvent =====
  const joinEvent = async (eventOrId) => {
    const eventId =
      typeof eventOrId === 'object' && eventOrId !== null
        ? eventOrId.id
        : eventOrId;
    return attend(eventId, true);
  };

  const leaveEvent = async (eventOrId) => {
    const eventId =
      typeof eventOrId === 'object' && eventOrId !== null
        ? eventOrId.id
        : eventOrId;
    return attend(eventId, false);
  };

  // ===== Forzar actualización de evento =====
  const forceRefreshEvent = async (eventId) => {
    if (!eventId) return null;
    const base = API_URL.endsWith('/')
      ? API_URL.slice(0, -1)
      : API_URL;
    const urls = [
      `${base}/events/${eventId}`,
      `${base}/event/${eventId}`,
      `${base}/api/events/${eventId}`,
      `${base}/api/event/${eventId}`,
      `${base}/v1/events/${eventId}`,
      `${base}/v1/event/${eventId}`,
    ];
    const headers = {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
    for (const url of urls) {
      try {
        const res = await safeFetch(
          url,
          { headers },
          { timeoutMs: 10000 }
        );
        if (!res.ok) continue;
        const json = await parseJsonSafe(res);
        if (json && typeof json === 'object') {
          setEvents((prev) => {
            const idx = prev.findIndex(
              (e) => String(e.id) === String(eventId)
            );
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], ...json };
            return next;
          });
          return json;
        }
      } catch {}
    }
    return null;
  };

  // ===== Eliminar evento =====
  const deleteEvent = async (eventId) => {
    if (!eventId) return;
    const prevSnapshot = events;
    setEvents((prev) =>
      prev.filter((e) => String(e.id) !== String(eventId))
    );

    try {
      const dbId = dbIdFrom(eventId);
      const headers = {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };

      if (dbId != null) {
        await safeFetch(
          `${API_URL}/events/${dbId}`,
          { method: 'DELETE', headers },
          { timeoutMs: 12000 }
        );
      } else {
        const ev =
          prevSnapshot.find(
            (e) => String(e.id) === String(eventId)
          ) || {};
        const ext = externalIdFrom(ev) || String(eventId);
        const src =
          ev.source || ev.type === 'api'
            ? 'ticketmaster'
            : 'unknown';
        const url = `${API_URL}/events/${encodeURIComponent(
          ext
        )}?source=${encodeURIComponent(
          src
        )}&externalId=${encodeURIComponent(ext)}`;
        await safeFetch(
          url,
          { method: 'DELETE', headers },
          { timeoutMs: 12000 }
        ).catch(() => {});
      }

      try {
        const key = storageKey(BASE_EVENTS_KEY, uid);
        const sanitized = normalizeForStorage(
          events.filter(
            (e) => String(e.id) !== String(eventId)
          )
        );
        AsyncStorage.setItem(
          key,
          JSON.stringify(sanitized)
        ).catch(() => {});
      } catch {}
    } catch (e) {
      console.warn('[deleteEvent] error:', e?.message || e);
      setEvents(prevSnapshot);
      try {
        const key = storageKey(BASE_EVENTS_KEY, uid);
        AsyncStorage.setItem(
          key,
          JSON.stringify(normalizeForStorage(prevSnapshot))
        ).catch(() => {});
      } catch {}
    }
  };

  // ===== Valores expuestos =====
  const value = useMemo(
    () => ({
      events,
      setEvents,
      formEvent,
      setFormEvent,
      coords,
      city,
      locLoading,
      favorites,
      favoriteItems,
      imageOverrides,
      overridesReady,
      isUpcoming,
      normalizeEvent,
      isMine,
      getEventImageSource,
      getEffectiveEventImage,
      toPatchPayload,
      addEvent,
      updateEvent,
      deleteEvent,
      mergeAssistants,
      attend,
      joinEvent, // 👈 ahora disponible
      leaveEvent, // 👈 ahora disponible
      forceRefreshEvent,
    }),
    [
      events,
      formEvent,
      coords,
      city,
      locLoading,
      favorites,
      favoriteItems,
      imageOverrides,
      overridesReady,
      authToken,
      uid,
    ]
  );

  return (
    <EventContext.Provider value={value}>
      {children}
    </EventContext.Provider>
  );
}

export const useEvents = () => useContext(EventContext);
