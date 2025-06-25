// src/EventContext.js
import React, { createContext, useState } from 'react';

export const EventContext = createContext();

export function EventProvider({ children }) {
    const [user, setUser] = useState({
    name: 'Usuario',
    email: '',
    });
    const [events, setEvents] = useState([
    {
      id: '1',
      title: 'Fiesta Universitaria',
      date: '2025-06-15',
      location: 'Sala X, Sevilla',
      description: '¡No te pierdas la mejor fiesta del mes!',
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

    const addEvent = (event) => {
        setEvents((prevEvents) => [
        { ...event, id: Date.now().toString(), createdBy: user.name }, // Añadimos el creador del evento
        ...prevEvents,
        ]);
    };
    const updateUser = (newUser) => setUser(newUser);
    return (
    <EventContext.Provider value={{ events, addEvent, user, updateUser }}>
        {children}
    </EventContext.Provider>
    );
}
