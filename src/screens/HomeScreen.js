import React, { useContext, useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, ActivityIndicator, Linking, Image } from 'react-native';
import { EventContext } from '../EventContext';
import { safePickImage } from '../utils/safePickImage';

const TICKETMASTER_API_KEY = 'jIIdDB9mZI5gZgJeDdeESohPT4Pl0wdi';

function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lat2 == null) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchTicketmasterEvents(city = 'madrid') {
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&countryCode=ES&city=${encodeURIComponent(city)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data._embedded?.events || [];
}

export default function HomeScreen({ navigation }) {
  const { events, favorites, toggleFavorite } = useContext(EventContext);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [apiEvents, setApiEvents] = useState([]);
  const [loadingApiEvents, setLoadingApiEvents] = useState(true);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'No podemos mostrar eventos cercanos sin acceso a tu ubicación.');
        setLoadingLocation(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setLoadingLocation(false);
    })();
  }, []);

  useEffect(() => {
    fetchTicketmasterEvents('Barcelona')
      .then(setApiEvents)
      .catch(() => setApiEvents([]))
      .finally(() => setLoadingApiEvents(false));
  }, []);

  const allEvents = [
    ...events.map(ev => ({ ...ev, type: 'local', 
      image: ev.image ?? ev.imageUrl ?? ev.imageUri ?? null, asistentes: ev.asistentes ?? [], // 👈 preserva})),
    })),
    ...apiEvents.map(ev => {
      const venue = ev._embedded?.venues?.[0];
      const lat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null;
      const lon = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null;
      return {
        id: `tm-${ev.id}`, // evita colisiones
        title: ev.name,
        date: ev.dates?.start?.localDate || '',
        location: venue?.city?.name || '',
        description: ev.info || '',
        latitude: lat,
        longitude: lon,
        url: ev.url,
        image: ev.images?.[0]?.url || null,
        type: 'api',
        images: ev.images || [],
      };
    }),
  ];

  const filteredEvents = allEvents
    .filter(e =>
      (e.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.location || '').toLowerCase().includes(search.toLowerCase())
    )
    .filter(e =>
      !location ||
      (e.latitude != null && e.longitude != null &&
        getDistanceKm(location.latitude, location.longitude, e.latitude, e.longitude) < 30)
    );

  // Elimina duplicados por (type-id)
  const deduped = [];
  const seen = new Set();
  for (const ev of filteredEvents) {
    const k = `${ev.type || 'local'}-${String(ev.id)}`;
    if (!seen.has(k)) {
      seen.add(k);
      deduped.push(ev);
    }
  }

  function FavoriteStar({ item }) {
    const isFav = favorites.includes(item.id);
    return (
      <View onStartShouldSetResponder={() => true} style={{ marginLeft: 10 }}>
        <TouchableOpacity onPress={() => toggleFavorite(item.id, item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={{ fontSize: 24 }}>{isFav ? '⭐' : '☆'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadingLocation || loadingApiEvents) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text>Cargando eventos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Buscar evento o ciudad..."
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={deduped}
        renderItem={({ item }) => {
          const img = item.image ?? item.imageUrl ?? item.imageUri ?? null; // 👈 definir aquí

          return (
            <TouchableOpacity
              style={[styles.eventCard, item.type === 'api' && { borderColor: '#1976d2', borderWidth: 1 }]}
              onPress={() => navigation.navigate('EventDetail', { event: item })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <FavoriteStar item={item} />
              </View>
              <Text>{item.date} | {item.location}</Text>
              <Text numberOfLines={2}>{item.description}</Text>

              {img ? (
                <Image
                  source={{ uri: img }}
                  style={{ width: '100%', height: 120, borderRadius: 8, marginTop: 5 }}
                />
              ) : null}
            </TouchableOpacity>
          );
        }}
        keyExtractor={(item) => `${item.type || 'local'}-${String(item.id)}`}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 32 }}>No hay eventos para mostrar.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginBottom: 10 },
  eventCard: { padding: 12, marginVertical: 6, borderRadius: 10, backgroundColor: '#F3F7FA', elevation: 1 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: '#1976d2' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
