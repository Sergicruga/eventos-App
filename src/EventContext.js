// src/EventContext.js
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';


export const EventContext = createContext();
const EVENTS_KEY = 'eventos_guardados';
const FAVORITES_KEY = 'favoritos_eventos';

export function EventProvider({ children }) {
    const [user, setUser] = useState({
    name: 'Usuario',
    email: '',
    });
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
        latitude: 40.4001, // <--- añade estos dos campos
        longitude: -3.6883,
        description: 'Bandas emergentes en directo.',
        createdBy: 'Usuario',
      },
      {
        id: '3',
        title: 'Tarde de Gaming',
        date: '2025-06-22',
        location: 'eSports Bar, Barcelona',
        latitude: 41.3870,  // <--- añade estos dos campos
        longitude: 2.1698,
        description: 'Torneos de Mario Kart y FIFA.',
        createdBy: 'Usuario',
      },
    ]);


    const [favorites, setFavorites] = useState([]); // <-- FAVORITOS
      useEffect(() => {
      AsyncStorage.getItem(FAVORITES_KEY)
        .then(data => {
          if (data) setFavorites(JSON.parse(data));
        })
        .catch(() => {});
    }, []);

  // Cada vez que cambien, guárdalos
      useEffect(() => {
        AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
      }, [favorites]);
      // Persistir eventos
      
      useEffect(() => {
        AsyncStorage.setItem(EVENTS_KEY, JSON.stringify(events));
      }, [events]);
      useEffect(() => {
        AsyncStorage.getItem(EVENTS_KEY)
          .then(data => {
            if (data) {
              const arr = JSON.parse(data);
              // Corrige tipos por si acaso
              arr.forEach(ev => {
                if (ev.latitude) ev.latitude = Number(ev.latitude);
                if (ev.longitude) ev.longitude = Number(ev.longitude);
              });
              setEvents(arr);
            }
          })
          .catch(() => {});
      }, []);


    const addEvent = (event) => {
      setEvents((prevEvents) => [
        { ...event, id: Date.now().toString(), createdBy: user.name },
        ...prevEvents,
      ]);
    };

    const updateUser = (newUser) => setUser(newUser);

    // Añadir/quitar favoritos
    const toggleFavorite = (eventId) => {
      setFavorites((prevFavs) =>
        prevFavs.includes(eventId)
          ? prevFavs.filter((id) => id !== eventId)
          : [...prevFavs, eventId]
      );
    };
    // --- NUEVO: apuntarse a un evento
    const joinEvent = (eventId) => {
      setEvents(prevEvents =>
        prevEvents.map(event =>
          event.id === eventId
            ? {
                ...event,
                asistentes: event.asistentes?.includes(user.name)
                  ? event.asistentes // Ya está apuntado
                  : [...(event.asistentes || []), user.name],
              }
            : event
        )
      );
    };

    // --- NUEVO: quitarse de un evento
    const leaveEvent = (eventId) => {
      setEvents(prevEvents =>
        prevEvents.map(event =>
          event.id === eventId
            ? {
                ...event,
                asistentes: (event.asistentes || []).filter(name => name !== user.name),
              }
            : event
        )
      );
    };
    
    return (

      <EventContext.Provider value={{
        events, addEvent, user, updateUser,
        favorites, toggleFavorite, joinEvent, leaveEvent
      }}>
        {children}
      </EventContext.Provider>
    );
}
