// src/EventContext.js
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';


export const EventContext = createContext();
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
      createdBy: 'Usuario', // Añadimos el creador del evento
    },
    {
      id: '2',
      title: 'Concierto Indie',
      date: '2025-06-20',
      location: 'Auditorio Río, Madrid',
      description: 'Bandas emergentes en directo.',
      createdBy: 'Usuario',
    },
    {
      id: '3',
      title: 'Tarde de Gaming',
      date: '2025-06-22',
      location: 'eSports Bar, Barcelona',
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
    

    return (

      <EventContext.Provider value={{
        events, addEvent, user, updateUser,
        favorites, toggleFavorite
      }}>
        {children}
      </EventContext.Provider>
    );
}
