import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
export const EventContext = createContext();
import { Alert } from 'react-native';


const EVENTS_KEY = 'eventos_guardados';
const FAVORITES_KEY = 'favoritos_eventos_ids';
const FAVORITES_MAP_KEY = 'favoritos_eventos_map';

export function EventProvider({ children }) {
  const [user, setUser] = useState({ name: 'Usuario', email: '' });

  const [events, setEvents] = useState([

  ]);

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
            if (ev.latitude) ev.latitude = Number(ev.latitude);
            if (ev.longitude) ev.longitude = Number(ev.longitude);
          });
          setEvents(arr);
        }
      } catch {}
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
      { ...event, id: Date.now().toString(), createdBy: user.name, asistentes: [] },
      ...prev,
    ]);
  };
  const normalizeEvent = (ev) => ({
    ...ev,
    image: ev.image ?? ev.imageUrl ?? ev.imageUri ?? null,
    imageUrl: undefined,
    imageUri: undefined,
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
      const idx = prev.findIndex(ev => ev.id === updatedEvent.id);
      if (idx === -1) {
        // No existía (probablemente era un evento de la API) → lo añadimos como local
        const nuevo = {
          ...u,
          type: 'local',
          createdBy: u.createdBy ?? (user?.name ?? 'Usuario'),
          asistentes: u.asistentes ?? [],
        };
        return [nuevo, ...prev];
      }
      // Existe → merge
      const next = [...prev];
      next[idx] = { 
        ...prevEvent,
        ...updatedEvent,
      // 👇 preserva asistentes si no lo manda el form
        asistentes: updatedEvent.asistentes ?? prevEvent.asistentes ?? [],
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

  return (
    <EventContext.Provider
      value={{ events, addEvent, updateEvent, deleteEvent, user, updateUser, favorites, favoriteItems, toggleFavorite, joinEvent, leaveEvent }}
    >
      {children}
    </EventContext.Provider>
  );
}
