import React, { useContext, createContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert } from 'react-native';
import { AuthContext } from "./context/AuthContext";
import { API_URL } from './api/config';
import { getFavoriteIds, addFavorite, removeFavorite } from './api/favorites';
import { attend as apiAttend, unattend as apiUnattend } from './api/attendees';
import { pickAndPersistImage } from './utils/pickAndPersistImage';
import { toImageSource } from './utils/imageSource';

export const EventContext = createContext();

// Utils
const isNumericId = (id) => /^\d+$/.test(String(id));
const dbIdFrom = (id) => (isNumericId(id) ? Number(id) : null);
const isLocalUri = (uri) => typeof uri === 'string' && uri.startsWith('file://');

const DEFAULT_EVENT_IMAGE = "https://via.placeholder.com/800x450.png?text=Evento";

const EVENTS_KEY = 'eventos_guardados';
const FAVORITES_KEY = 'favoritos_eventos_ids';
const FAVORITES_MAP_KEY = 'favoritos_eventos_map';
const EVENT_IMAGE_OVERRIDES_KEY = 'event_image_overrides'; // { [eventId]: "file://..." }

export function EventProvider({ children }) {
  // Usuario
  const [user, setUser] = useState({ name: 'Usuario', email: '' });
  const auth = AuthContext ? useContext(AuthContext) : null;
  const effectiveUser = auth?.user ?? user;

  // Estado principal
  const [events, setEvents] = useState([]);

  // Formulario de creación/edición
  const [formEvent, setFormEvent] = useState({
    title: '',
    date: '',
    location: '',
    description: '',
    image: null, // 'file://...' | 'https://...' | '/uploads/...'
    type: 'local',
    latitude: null,
    longitude: null,
  });

  // Ubicación global
  const [coords, setCoords] = useState(null);
  const [city, setCity] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  // Favoritos
  const [favorites, setFavorites] = useState([]);
  const [favoriteItems, setFavoriteItems] = useState({});

  // Overrides locales de imagen (idEvento -> file://ruta)
  const [imageOverrides, setImageOverrides] = useState({});
  const [overridesReady, setOverridesReady] = useState(false);

  // ===== CARGA INICIAL =====
  useEffect(() => {
    (async () => {
      try {
        // Favoritos
        const [favIds, favMap] = await Promise.all([
          AsyncStorage.getItem(FAVORITES_KEY),
          AsyncStorage.getItem(FAVORITES_MAP_KEY),
        ]);
        if (favIds) setFavorites(JSON.parse(favIds));
        if (favMap) setFavoriteItems(JSON.parse(favMap));
      } catch {}

      // Overrides de imagen
      try {
        const raw = await AsyncStorage.getItem(EVENT_IMAGE_OVERRIDES_KEY);
        if (raw) setImageOverrides(JSON.parse(raw));
      } catch {} finally {
        // muy importante: ya intentamos cargar los overrides
        setOverridesReady(true);
      }

      // Eventos desde backend (si hay)
      try {
        const uid = auth?.user?.id;
        const url = `${API_URL}/events${uid ? `?userId=${uid}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        // ⚠️ No mezcles overrides aquí; guarda lo del server y aplica override al pintar
        const mapped = (data || []).map(ev => ({
          id: String(ev.id),
          title: ev.title,
          description: ev.description ?? '',
          date: ev.event_at?.slice(0, 10) ?? '',
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
        }));

        setEvents(mapped);
        AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(mapped)).catch(() => {});
      } catch {
        // Fallback a caché local
        try {
          const savedEvents = await AsyncStorage.getItem(EVENTS_KEY);
          if (savedEvents) {
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
      }
    })();
  }, []);

  // Persistir overrides cuando cambien
  useEffect(() => {
    AsyncStorage.setItem(EVENT_IMAGE_OVERRIDES_KEY, JSON.stringify(imageOverrides)).catch(() => {});
  }, [imageOverrides]);

  // ===== UBICACIÓN =====
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

  // ===== PERSISTENCIAS =====
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)).catch(() => {});
  }, [favorites]);

  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_MAP_KEY, JSON.stringify(favoriteItems)).catch(() => {});
  }, [favoriteItems]);

  useEffect(() => {
    AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events)).catch(() => {});
  }, [events]);

  // ===== SINCRONIZAR FAVORITOS CON BD =====
  useEffect(() => {
    (async () => {
      const uid = auth?.user?.id;
      if (!uid) return; // sin usuario => mantenemos favoritos locales
      try {
        const serverIds = await getFavoriteIds(uid); // [1,5,9,...]
        const serverAsStrings = serverIds.map(String);
        const localNonDb = favorites.filter((fid) => !isNumericId(fid));
        const merged = Array.from(new Set([...serverAsStrings, ...localNonDb]));
        setFavorites(merged);
      } catch (e) {
        console.warn('No se pudieron cargar favoritos del servidor:', e.message);
      }
    })();
  }, [auth?.user?.id]);

  // ===== HELPERS =====
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

  // 👉 source válido para <Image>
  const getEventImageSource = (img) => toImageSource(img);

  // 👉 imagen efectiva: override local > servidor
  const getEffectiveEventImage = (eventId, serverImage) => {
    const over = imageOverrides?.[String(eventId)];
    return over ?? serverImage ?? null;
  };

  // ===== ELEGIR IMAGEN (form) =====
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

  // ===== CREAR EVENTO (con override si hay file://) =====
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
        event_at: event.date,
        location: event.location ?? '',
        type: event.type || 'local',
        image: (event.image && !isLocalUri(event.image) && event.image.trim() !== "") ? event.image : "",
        latitude: event.latitude ?? null,
        longitude: event.longitude ?? null,
        created_by: effectiveUser?.id ?? null,
      };

      const res = await fetch(`${API_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

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
      };

      // Copia la imagen local al sandbox y guarda override
      if (event.image && isLocalUri(event.image)) {
        try {
          const ext = event.image.split('.').pop()?.toLowerCase() || 'jpg';
          const dir = FileSystem.documentDirectory + 'events/';
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
          const dest = `${dir}event_${saved.id}.${ext}`;
          await FileSystem.copyAsync({ from: event.image, to: dest });

          // <<<< GUARDA SINCRÓNICAMENTE >>>>
         // 1) Actualiza estado in-memory
         setImageOverrides(prev => ({ ...prev, [String(saved.id)]: dest }));
         // 2) Lee el estado actualizado y PERSISTE con await (evita perderlo al cerrar)
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
        image: event.image || event.imageUrl || event.imageUri || DEFAULT_EVENT_IMAGE,
        createdBy: user.name,
        asistentes: [],
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

  // ===== EDITAR =====
  const updateEvent = (updatedEvent) => {
    const t = Date.parse(updatedEvent.date);
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (Number.isNaN(t) || t < todayMid) {
      Alert.alert('Fecha inválida', 'No puedes poner una fecha anterior a hoy.');
      return;
    }
    const u = normalizeEvent(updatedEvent);

    setEvents(prev => {
      const idx = prev.findIndex(ev => String(ev.id) === String(u.id));
      if (idx === -1) {
        const nuevo = {
          ...u,
          type: u.type || 'local',
          createdBy: u.createdBy ?? (user?.name ?? 'Usuario'),
          asistentes: u.asistentes ?? [],
        };
        return [nuevo, ...prev];
      }
      const next = [...prev];
      const prevEv = prev[idx];
      next[idx] = {
        ...prevEv,
        ...u,
        asistentes: u.asistentes ?? prevEv.asistentes ?? [],
      };
      return next;
    });
  };

  // ===== BORRAR =====
  const deleteEvent = async (eventId) => {
    try {
      const dbId = dbIdFrom(eventId);
      if (dbId != null) {
        const res = await fetch(`${API_URL}/events/${dbId}`, { method: 'DELETE' });
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

  // ===== FAVORITOS =====
  const toggleFavorite = async (eventId, eventObj) => {
    const alreadyFav = favorites.includes(eventId);

    // UI optimista
    setFavorites(prev => (alreadyFav ? prev.filter(id => id !== eventId) : [eventId, ...prev]));
    if (!alreadyFav && eventObj) {
      setFavoriteItems(prevMap => ({
        ...prevMap,
        [eventId]: {
          id: String(eventObj.id),
          title: eventObj.title || '',
          date: eventObj.date || '',
          location: eventObj.location || '',
          description: eventObj.description || '',
          image: eventObj.image || (eventObj.images?.[0]?.url ?? null),
          type: eventObj.type || 'local',
          latitude: eventObj.latitude != null ? Number(eventObj.latitude) : null,
          longitude: eventObj.longitude != null ? Number(eventObj.longitude) : null,
        },
      }));
    }
    if (alreadyFav) {
      setFavoriteItems(prevMap => {
        const copy = { ...prevMap };
        delete copy[eventId];
        return copy;
      });
    }

    try {
      const uid = auth?.user?.id;
      const dbId = dbIdFrom(eventId);

      if (!uid) { console.warn('[fav] no user logged → solo local'); return; }
      if (dbId == null) { console.warn('[fav] evento externo (no BD) → solo local'); return; }

      if (alreadyFav) {
        await removeFavorite(uid, dbId);
      } else {
        await addFavorite(uid, dbId);
      }
    } catch (e) {
      console.warn('toggleFavorite (persistencia) error:', e.message);
      // revert si falla
      setFavorites(prev => (alreadyFav ? [eventId, ...prev] : prev.filter(id => id !== eventId)));
    }
  };

  // ===== ASISTIR / SALIR =====
  const joinEvent = async (eventId) => {
    const uid = auth?.user?.id;
    const dbId = dbIdFrom(eventId);

    // UI optimista
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

    // Persistencia
    try {
      if (!uid || dbId == null) return;
      await apiAttend(uid, dbId);
    } catch (err) {
      console.warn('joinEvent persist error:', err?.message);
      // revert
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
    const uid = auth?.user?.id;
    const dbId = dbIdFrom(eventId);

    // UI optimista
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
      // revert
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

  // Memoizados (por si los usas en otras vistas)
  const myEvents = useMemo(() => events.filter(isMine), [events, user]);
  const communityEvents = useMemo(() => events.filter(e => !isMine(e)), [events, user]);

  return (
    <EventContext.Provider
      value={{
        // datos
        events, myEvents, communityEvents,
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
        // ubicación
        coords, city, locLoading,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}
