import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const EventContext = createContext();

const EVENTS_KEY = 'eventos_guardados';
const FAVORITES_KEY = 'favoritos_eventos_ids';
const FAVORITES_MAP_KEY = 'favoritos_eventos_map';

export function EventProvider({ children }) {
  const [user, setUser] = useState({ name: 'Usuario', email: '' });

  const [events, setEvents] = useState([
    {
      id: '1',
      title: 'Concierto joven',
      date: '2025-08-10',
      location: 'Madrid',
      latitude: 40.4168,
      longitude: -3.7038,
      description: 'Concierto en el centro de Madrid.',
      createdBy: 'Usuario',
    },
    {
      id: '2',
      title: 'Concierto Indie',
      date: '2025-06-20',
      location: 'Auditorio Río, Madrid',
      latitude: 40.4001,
      longitude: -3.6883,
      description: 'Bandas emergentes en directo.',
      createdBy: 'Usuario',
    },
    {
      id: '3',
      title: 'Tarde de Gaming',
      date: '2025-06-22',
      location: 'eSports Bar, Barcelona',
      latitude: 41.3870,
      longitude: 2.1698,
      description: 'Torneos de Mario Kart y FIFA.',
      createdBy: 'Usuario',
    },
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
    setEvents(prev => [{ ...event, id: Date.now().toString(), createdBy: user.name }, ...prev]);
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
      value={{ events, addEvent, user, updateUser, favorites, favoriteItems, toggleFavorite, joinEvent, leaveEvent }}
    >
      {children}
    </EventContext.Provider>
  );
}
