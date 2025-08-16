import React, { createContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker'; // (lo mantengo por si lo usas en otras pantallas)
import * as Location from 'expo-location';
import { Alert } from 'react-native';

export const EventContext = createContext();

const EVENTS_KEY = 'eventos_guardados';
const FAVORITES_KEY = 'favoritos_eventos_ids';
const FAVORITES_MAP_KEY = 'favoritos_eventos_map';

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

  // Cargar persistencia
  useEffect(() => {
    (async () => {
      try {
        const [favIds, favMap, savedEvents] = await Promise.all([
          AsyncStorage.getItem(FAVORITES_KEY),
          AsyncStorage.getItem(FAVORITES_MAP_KEY),
          AsyncStorage.getItem(EVENTS_KEY),
        ]);
        if (favIds) setFavorites(JSON.parse(favIds));
        if (favMap) setFavoriteItems(JSON.parse(favMap));
        if (savedEvents) {
          const arr = JSON.parse(savedEvents);
          arr.forEach(ev => {
            if (ev.latitude != null) ev.latitude = Number(ev.latitude);
            if (ev.longitude != null) ev.longitude = Number(ev.longitude);
            // Normalizamos imagen para compatibilidad antigua
            ev.image = ev.image ?? ev.imageUrl ?? ev.imageUri ?? null;
          });
          setEvents(arr);
        }
      } catch {}
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

  const addEvent = (event) => {
    // Espera fecha en ISO: YYYY-MM-DD
    const eventMs = Date.parse(event.date);
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (Number.isNaN(eventMs) || eventMs < todayMid) {
      Alert.alert('Fecha inválida', 'No puedes crear un evento con una fecha pasada.');
      return;
    }
    setEvents(prev => [
      {
        ...event,
        // normalizamos imagen en la creación
        image: event.image ?? event.imageUrl ?? event.imageUri ?? null,
        id: Date.now().toString(),
        createdBy: user.name,
        asistentes: [],
      },
      ...prev,
    ]);
  };
  // EventContext
  const isMine = (ev) => {
    // Caso 1: tiene createdById
    if (ev?.createdById && user?.id) return ev.createdById === user.id;

    // Caso 2: legado, solo texto
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
        // No existía (por ejemplo, venía de API y lo conviertes a local)
        const nuevo = {
          ...u,
          type: 'local',
          createdBy: u.createdBy ?? (user?.name ?? 'Usuario'),
          asistentes: u.asistentes ?? [],
        };
        return [nuevo, ...prev];
      }
      // Existe → merge (ARREGLO: usar prev[idx] en vez de prevEvent inexistente)
      const next = [...prev];
      const prevEv = prev[idx];
      next[idx] = {
        ...prevEv,
        ...u,
        // preserva asistentes si no lo manda el form
        asistentes: u.asistentes ?? prevEv.asistentes ?? [],
      };
      return next;
    });
  };

  const deleteEvent = (eventId) => {
    setEvents(prev => prev.filter(ev => ev.id !== eventId));
  };

  const updateUser = (newUser) => setUser(newUser);

  // Toggle favorito: recibe ID y opcionalmente el evento (para snapshot si no es local)
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

  // NUEVO: selectores
  const myEvents = useMemo(() => events.filter(isMine), [events, user]);
  const communityEvents = useMemo(() => events.filter(e => !isMine(e)), [events, user]);


  return (
    <EventContext.Provider
      value={{
        // existentes
        events, addEvent, updateEvent, deleteEvent,
        user, updateUser,
        favorites, favoriteItems, toggleFavorite, joinEvent, leaveEvent,

        // NUEVO expuesto
        coords, city, locLoading,
        myEvents, communityEvents,
      }}
    >
      {children}
    </EventContext.Provider>
  );
}
