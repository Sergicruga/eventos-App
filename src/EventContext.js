import React, { createContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker'; // (lo mantengo por si lo usas en otras pantallas)
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export const EventContext = createContext();

const EVENTS_KEY = 'eventos_guardados';
const FAVORITES_KEY = 'favoritos_eventos_ids';
const FAVORITES_MAP_KEY = 'favoritos_eventos_map';

// Cambia esto a la URL de tu backend si es necesario
const API_URL = "http://localhost:4000";

export function EventProvider({ children }) {
  const [user, setUser] = useState({ name: 'Usuario', email: '' });

  const [events, setEvents] = useState([]);

  // NUEVO: ubicación global
  const [coords, setCoords] = useState(null);    // { latitude, longitude }
  const [city, setCity] = useState(null);        // p.ej. "Madrid"
  const [locLoading, setLocLoading] = useState(true);

  // Favoritos = IDs y un mapa con el “snapshot” del evento
  const [favorites, setFavorites] = useState([]);          // string[]
  const [favoriteItems, setFavoriteItems] = useState({});  // { [id]: EventSnapshot }

  // Cargar persistencia y eventos desde backend
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
      // Cargar eventos desde el backend
      try {
        const res = await fetch(`${API_URL}/events`);
        const data = await res.json();
        // Mapeo de campos del backend a frontend
        const mapped = data.map(ev => ({
          id: String(ev.id),
          title: ev.title,
          description: ev.description,
          date: ev.event_at?.slice(0, 10) ?? "",
          location: ev.location,
          type: ev.type,
          image: ev.image,
          latitude: ev.latitude,
          longitude: ev.longitude,
          createdBy: ev.created_by || "Desconocido",
          asistentes: [],
        }));
        setEvents(mapped);
        AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(mapped)).catch(()=>{});
      } catch {
        // Si falla, cargar de almacenamiento local
        try {
          const savedEvents = await AsyncStorage.getItem(EVENTS_KEY);
          if (savedEvents) {
            const arr = JSON.parse(savedEvents);
            arr.forEach(ev => {
              if (ev.latitude != null) ev.latitude = Number(ev.latitude);
              if (ev.longitude != null) ev.longitude = Number(ev.longitude);
              ev.image = ev.image ?? ev.imageUrl ?? ev.imageUri ?? null;
            });
            setEvents(arr);
          }
        } catch {}
      }
    })();
  }, []);

  // NUEVO: Detectar ubicación al abrir la app (y ciudad aprox.)
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

  // Guardar persistencia
  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)).catch(()=>{});
  }, [favorites]);

  useEffect(() => {
    AsyncStorage.setItem(FAVORITES_MAP_KEY, JSON.stringify(favoriteItems)).catch(()=>{});
  }, [favoriteItems]);

  useEffect(() => {
    AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events)).catch(()=>{});
  }, [events]);

  // Cambiado: ahora agrega evento vía backend
  const addEvent = async (event) => {
    const eventMs = Date.parse(event.date);
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (Number.isNaN(eventMs) || eventMs < todayMid) {
      Alert.alert('Fecha inválida', 'No puedes crear un evento con una fecha pasada.');
      return;
    }
    try {
      const res = await fetch(`${API_URL}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: event.title,
          description: event.description,
          event_at: event.date,
          location: event.location,
          type: event.type,
          image: event.image,
          latitude: event.latitude,
          longitude: event.longitude,
          created_by: user.name,
        }),
      });
      const saved = await res.json();
      setEvents(prev => [
        {
          ...event,
          id: String(saved.id),
          createdBy: user.name,
          asistentes: [],
        },
        ...prev,
      ]);
    } catch (e) {
      // fallback local si falla el backend
      setEvents(prev => [
        {
          ...event,
          image: event.image ?? event.imageUrl ?? event.imageUri ?? null,
          id: Date.now().toString(),
          createdBy: user.name,
          asistentes: [],
        },
        ...prev,
      ]);
    }
  };

  // EventContext
  const isMine = (ev) => {
    if (ev?.createdById && user?.id) return ev.createdById === user.id;
    if (ev?.createdBy && user?.name) {
      return ev.createdBy.trim().toLowerCase() === user.name.trim().toLowerCase();
    }
    return false;
  };

  const normalizeEvent = (ev) => ({
    ...ev,
    image: ev.image ?? ev.imageUrl ?? ev.imageUri ?? null,
  });

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
          type: 'local',
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

  const deleteEvent = (eventId) => {
    setEvents(prev => prev.filter(ev => ev.id !== eventId));
  };

  const updateUser = (newUser) => setUser(newUser);

  const toggleFavorite = (eventId, eventObj) => {
    setFavorites(prev => {
      const isFav = prev.includes(eventId);
      if (isFav) {
        setFavoriteItems(prevMap => {
          const copy = { ...prevMap };
          delete copy[eventId];
          return copy;
        });
        return prev.filter(id => id !== eventId);
      } else {
        if (eventObj) {
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
        return [eventId, ...prev];
      }
    });
  };

  const joinEvent = (eventId) => {
    setEvents(prev =>
      prev.map(e =>
        e.id === eventId
          ? { ...e, asistentes: e.asistentes?.includes(user.name) ? e.asistentes : [...(e.asistentes || []), user.name] }
          : e
      )
    );
  };

  const leaveEvent = (eventId) => {
    setEvents(prev =>
      prev.map(e =>
        e.id === eventId
          ? { ...e, asistentes: (e.asistentes || []).filter(n => n !== user.name) }
          : e
      )
    );
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
