// src/EventContext.js
import React, { useContext, createContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Alert, Platform  } from 'react-native';
import { AuthContext } from "./context/AuthContext"; 
import { API_URL } from './api/config';
import { getFavoriteIds, addFavorite, removeFavorite } from './api/favorites';
import { attend as apiAttend, unattend as apiUnattend } from './api/attendees';
export const EventContext = createContext();
const isNumericId = (id) => /^\d+$/.test(String(id));      // ej: "15" → true, "tm-123" → false
const dbIdFrom = (id) => (isNumericId(id) ? Number(id) : null);

const EVENTS_KEY = 'eventos_guardados';
const FAVORITES_KEY = 'favoritos_eventos_ids';
const FAVORITES_MAP_KEY = 'favoritos_eventos_map';

export function EventProvider({ children }) {
  const [user, setUser] = useState({ name: 'Usuario', email: '' });
  const auth = AuthContext ? useContext(AuthContext) : null;
  const effectiveUser = auth?.user ?? user;
  const [events, setEvents] = useState([]);

  // Ubicación global
  const [coords, setCoords] = useState(null);
  const [city, setCity] = useState(null);
  const [locLoading, setLocLoading] = useState(true);

  // Favoritos
  const [favorites, setFavorites] = useState([]);
  const [favoriteItems, setFavoriteItems] = useState({});

  // Carga inicial (favoritos + eventos)
  useEffect(() => {
    (async () => {
      try {
        const [favIds, favMap] = await Promise.all([
          AsyncStorage.getItem(FAVORITES_KEY),
          AsyncStorage.getItem(FAVORITES_MAP_KEY),
        ]);
        if (favIds) setFavorites(JSON.parse(favIds));
        if (favMap) setFavoriteItems(JSON.parse(favMap));
    } catch {}

    try {
      // ⬇️ Pasamos el userId si hay usuario logueado
      const uid = auth?.user?.id;
      const url = `${API_URL}/events${uid ? `?userId=${uid}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const mapped = (data || []).map(ev => ({
        id: String(ev.id),
        title: ev.title,
        description: ev.description ?? '',
        date: ev.event_at?.slice(0, 10) ?? '',
        location: ev.location ?? '',
        type: ev.type || 'local',
        image: ev.image ?? null,
        latitude: ev.latitude != null ? Number(ev.latitude) : null,
        longitude: ev.longitude != null ? Number(ev.longitude) : null,
        createdBy: ev.created_by || 'Desconocido',

        // ⬇️ NUEVO: campos que vienen del backend cuando mandas ?userId=
        isAttending: Boolean(ev.is_attending),               // true/false
        attendeesCount: Number(ev.attendees_count ?? 0),     // entero

        // Si quieres, también puedes aprovechar is_favorite aquí (opcional)
        // isFavorite: Boolean(ev.is_favorite),

        // Mantén tu lista local si la usas en la UI
        asistentes: [],
      }));

      setEvents(mapped);
      AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(mapped)).catch(() => {});
    } catch (e) {
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

  // Ubicación inicial (coords + ciudad)
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

  // Persistencia
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)).catch(() => {});
  }, [favorites]);

  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_MAP_KEY, JSON.stringify(favoriteItems)).catch(() => {});
  }, [favoriteItems]);

  useEffect(() => {
    AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events)).catch(() => {});
  }, [events]);
  // Sincroniza favoritos desde BD si hay usuario logueado (fusiona con los locales que no sean de BD)
  useEffect(() => {
    (async () => {
      const uid = auth?.user?.id;
      if (!uid) return; // sin usuario => mantenemos favoritos locales
      try {
        const serverIds = await getFavoriteIds(uid); // [1,5,9,...]
        // Convertimos a strings como usas en 'favorites'
        const serverAsStrings = serverIds.map(String);

        // Mantiene favoritos locales que NO son de BD (ej. Ticketmaster "tm-...")
        const localNonDb = favorites.filter((fid) => !isNumericId(fid));
        const merged = Array.from(new Set([...serverAsStrings, ...localNonDb]));
        setFavorites(merged);
      } catch (e) {
        console.warn('No se pudieron cargar favoritos del servidor:', e.message);
      }
    })();
  }, [auth?.user?.id]);

  // Helpers
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

  // Crear evento (API + fallback local con logs)
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
        event_at: event.date, // YYYY-MM-DD
        location: event.location ?? '',
        type: event.type || 'local',
        image: event.image ?? null,
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
      console.log('POST /events status:', res.status);
      console.log('POST /events raw body:', raw);

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
        image: saved.image ?? (event.image ?? null),
        latitude: saved.latitude != null ? Number(saved.latitude) : (event.latitude ?? null),
        longitude: saved.longitude != null ? Number(saved.longitude) : (event.longitude ?? null),
        createdById: saved?.created_by ?? null,
        createdBy: saved?.created_by_name ?? effectiveUser?.name ?? user.name, 
        asistentes: [],
      };

      setEvents(prev => [mapped, ...prev]);
      return mapped;

    } catch (e) {
      console.warn('Fallo backend, guardando localmente:', e.message);
      setEvents(prev => [
        {
          ...event,
          id: Date.now().toString(),
          type: event.type || 'local',
          image: event.image ?? event.imageUrl ?? event.imageUri ?? null,
          createdBy: user.name,
          asistentes: [],
        },
        ...prev,
      ]);
    }
  };

  // Editar (local; añade PUT al server si quieres)
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
      const idx = prev.findIndex(ev => ev.id === u.id);
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

  // Borrar (local)
  const deleteEvent = (eventId) => {
    setEvents(prev => prev.filter(ev => ev.id !== eventId));
  };

  // Usuario
  const updateUser = (newUser) => setUser(newUser);

  // Favoritos
  const isNumericId = (id) => /^\d+$/.test(String(id));
  const dbIdFrom = (id) => (isNumericId(id) ? Number(id) : null);

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
    const dbId = /^\d+$/.test(String(eventId)) ? Number(eventId) : null;

    console.log('[toggleFavorite] uid=', uid, 'eventId=', eventId, 'dbId=', dbId, 'API_URL=', API_URL);

    if (!uid) { console.warn('[fav] no user logged → solo local'); return; }
    if (dbId == null) { console.warn('[fav] evento externo (no BD) → solo local'); return; }

    if (alreadyFav) {
      const r = await removeFavorite(uid, dbId);
      console.log('[fav] removeFavorite OK', r);
    } else {
      const r = await addFavorite(uid, dbId);
      console.log('[fav] addFavorite OK', r);
    }
  } catch (e) {
    console.warn('toggleFavorite (persistencia) error:', e.message);
    // revert si falla
    setFavorites(prev => (alreadyFav ? [eventId, ...prev] : prev.filter(id => id !== eventId)));
  }
};



  // Asistir / salir (local)
  
  const joinEvent = async (eventId) => {
  const uid = auth?.user?.id;
  const dbId = isNumericId(eventId) ? Number(eventId) : null;

  // UI optimista: marca asistiendo y suma contador
  setEvents(prev => prev.map(e =>
    e.id === eventId
      ? {
          ...e,
          isAttending: true,
          attendeesCount: (e.attendeesCount ?? 0) + 1,
          // Mantén tu lista de nombres si la usas en la UI:
          asistentes: e.asistentes?.includes(effectiveUser?.name ?? user.name)
            ? e.asistentes
            : [...(e.asistentes || []), (effectiveUser?.name ?? user.name)],
        }
      : e
  ));

  // Persistencia si hay user y es evento de BD
  try {
    if (!uid || dbId == null) return;
    await apiAttend(uid, dbId);
  } catch (err) {
    console.warn('joinEvent persist error:', err?.message);
    // revert si falla
    setEvents(prev => prev.map(e =>
      e.id === eventId
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
  const dbId = isNumericId(eventId) ? Number(eventId) : null;

  // UI optimista: desmarca y resta contador
  setEvents(prev => prev.map(e =>
    e.id === eventId
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
    // revert si falla
    setEvents(prev => prev.map(e =>
      e.id === eventId
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


  const myEvents = useMemo(() => events.filter(isMine), [events, user]);
  const communityEvents = useMemo(() => events.filter(e => !isMine(e)), [events, user]);

  return (
    <EventContext.Provider
      value={{
        events, addEvent, updateEvent, deleteEvent,
        user, updateUser,
        favorites, favoriteItems, toggleFavorite, joinEvent, leaveEvent,
        coords, city, locLoading,
        myEvents, communityEvents,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}
