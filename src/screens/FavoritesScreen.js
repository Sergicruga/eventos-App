// src/screens/FavoritesScreen.js
import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { EventContext } from './EventContext';              // <-- ruta corregida
import { AuthContext } from '../context/AuthContext';
import { getFavoriteEvents } from '../api/favorites';        // usa el endpoint /users/:id/favorites/events

export default function FavoritesScreen({ navigation }) {
  const { favorites, favoriteItems } = useContext(EventContext);
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [serverFavs, setServerFavs] = useState([]); // eventos completos desde BD

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!user?.id) {
          setServerFavs([]);
          return;
        }
        const data = await getFavoriteEvents(user.id);
        // Normalizamos al mismo shape que usas en la app (id, title, date, location, image, description)
        const mapped = (data || []).map(e => ({
          id: String(e.id),
          title: e.title || '',
          date: e.event_at?.slice(0,10) || '',
          location: e.location || '',
          description: e.description || '',
          image: e.image || null,
          latitude: e.latitude ?? null,
          longitude: e.longitude ?? null,
          type: e.type || 'local',
        }));
        if (mounted) setServerFavs(mapped);
      } catch (e) {
        console.warn('Error cargando favoritos de BD:', e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [user?.id]);

  // Lista local desde snapshots (lo que ya tenías)
  const localFavs = useMemo(
    () => favorites.map(id => favoriteItems[id]).filter(Boolean),
    [favorites, favoriteItems]
  );

  // Fusionamos: prioriza snapshot local (por si es más reciente), y añadimos los del server que falten
  const favEvents = useMemo(() => {
    const byId = new Map();
    for (const ev of localFavs) byId.set(String(ev.id), ev);
    for (const ev of serverFavs) if (!byId.has(String(ev.id))) byId.set(String(ev.id), ev);
    return Array.from(byId.values());
  }, [localFavs, serverFavs]);

  if (user?.id && loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Cargando favoritos…</Text>
      </View>
    );
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.eventCard} onPress={() => navigation.navigate('EventDetail', { event: item })}>
      {item.image ? <Image source={{ uri: item.image }} style={styles.image} /> : null}
      <Text style={styles.eventTitle}>{item.title || '-'}</Text>
      <Text>{(item.date || '') + (item.location ? ` | ${item.location}` : '')}</Text>
      <Text numberOfLines={2} style={styles.eventDesc}>{item.description || ''}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tus eventos favoritos</Text>
      <FlatList
        data={favEvents}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 20 }}>
            {user?.id ? 'Aún no has marcado favoritos.' : 'Inicia sesión para ver tus favoritos.'}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  eventCard: { backgroundColor: '#f4f4f4', borderRadius: 12, padding: 12, marginBottom: 12 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 6 },
  eventDesc: { color: '#666', marginTop: 4 },
  image: { width: '100%', height: 120, borderRadius: 8 },
});
