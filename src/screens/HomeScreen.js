import React, { useContext, useState, useEffect } from 'react';
import * as Location from 'expo-location';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, ActivityIndicator, Linking } from 'react-native';
import { EventContext } from '../EventContext';
import { Image } from 'react-native';

// Usa tu propia API key real aquí
const TICKETMASTER_API_KEY = "jIIdDB9mZI5gZgJeDdeESohPT4Pl0wdi";

// Calcula la distancia entre dos puntos (en km)
function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lat2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Llama a Ticketmaster por ciudad
async function fetchTicketmasterEvents(city = 'Barcelona') {
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&countryCode=ES&city=${encodeURIComponent(city)}`;
  const response = await fetch(url);
  const data = await response.json();
  return data._embedded?.events || [];
}

export default function HomeScreen({ navigation }) {
  const { events, favorites, toggleFavorite } = useContext(EventContext);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [apiEvents, setApiEvents] = useState([]);
  const [loadingApiEvents, setLoadingApiEvents] = useState(true);

  // Ubicación
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'No podemos mostrar eventos cercanos sin acceso a tu ubicación.');
        setLoadingLocation(false);
        return;
      }
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setLoadingLocation(false);
    })();
  }, []);

  // Ticketmaster
  useEffect(() => {
    fetchTicketmasterEvents("Barcelona")
      .then(events => setApiEvents(events))
      .catch(() => setApiEvents([]))
      .finally(() => setLoadingApiEvents(false));
  }, []);

  // Une tus eventos y los de Ticketmaster
  const allEvents = [
    ...events.map(ev => ({
      ...ev,
      type: 'local', // Para distinguirlos visualmente
    })),
    ...apiEvents
      .map(ev => {
        let lat = null, lon = null;
        const venue = ev._embedded?.venues?.[0];
        if (venue && venue.location && venue.location.latitude && venue.location.longitude) {
          lat = parseFloat(venue.location.latitude);
          lon = parseFloat(venue.location.longitude);
        }
        return {
          id: ev.id,
          title: ev.name,
          date: ev.dates?.start?.localDate || '',
          location: venue?.city?.name || '',
          description: ev.info || '',
          latitude: lat,
          longitude: lon,
          url: ev.url,
          image: ev.images?.[0]?.url || null,
          type: 'api',
          images: ev.images || [], // Para compatibilidad con EventDetailScreen
        };
      })
  ];

  // Filtrado buscador y distancia
  const filteredEvents = allEvents
    .filter(event =>
      (event.title?.toLowerCase().includes(search.toLowerCase()) ||
      event.location?.toLowerCase().includes(search.toLowerCase()))
    )
    .filter(event =>
      !location ||
      (event.latitude && event.longitude &&
        getDistanceKm(location.latitude, location.longitude, event.latitude, event.longitude) < 30)
    );

  // Render de la estrella de favoritos
  function FavoriteStar({ eventId }) {
    const isFavorite = (event) => favorites.some(fav => fav.id === event.id);
    return (
      <TouchableOpacity
        onPress={() => toggleFavorite(eventId)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        style={{ marginLeft: 10 }}
      >
        <Text style={{ fontSize: 24 }}>{isFavorite ? '⭐' : '☆'}</Text>
      </TouchableOpacity>
    );
  }

  // Abre el enlace del evento (solo usado si haces un botón aparte)
  const handleOpenUrl = (item) => {
    let openUrl = item.url;
    try {
      const urlObj = new URL(item.url);
      if (urlObj.hostname.includes('tm7508.net') && urlObj.searchParams.has('u')) {
        openUrl = decodeURIComponent(urlObj.searchParams.get('u'));
      }
    } catch (e) {}
    if (openUrl && openUrl.startsWith('http')) {
      Linking.openURL(openUrl).catch(() => {
        Alert.alert("No se puede abrir el enlace", "Ha ocurrido un error al abrir el enlace.");
      });
    } else {
      Alert.alert("Enlace inválido", "Este evento no tiene un enlace válido.");
    }
  };
  // justo antes del render:
  const deduped = [];
  const seen = new Set();
    for (const ev of filteredEvents) {
      const k = `${ev.type || 'local'}-${String(ev.id)}`;
      if (!seen.has(k)) {
        seen.add(k);
        deduped.push(ev);
      }
    }


  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.eventCard, item.type === 'api' && { borderColor: '#1976d2', borderWidth: 1 }]}
      onPress={() => navigation.navigate('EventDetail', { event: item })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.eventTitle}>
          {item.title}
        </Text>
        <FavoriteStar eventId={item.id} />
      </View>
      <Text>{item.date} | {item.location}</Text>
      <Text numberOfLines={2}>{item.description}</Text>
      {item.image && (
        <Image source={{ uri: item.image }} style={{ width: "100%", height: 120, borderRadius: 8, marginTop: 5 }} />
      )}
    </TouchableOpacity>
  );

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
        data={filteredEvents}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type || 'local'}-${String(item.id)}`}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 32 }}>No hay eventos para mostrar.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8, marginBottom: 10
  },
  eventCard: {
    padding: 12,
    marginVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F3F7FA",
    elevation: 1
  },
  eventTitle: { fontSize: 16, fontWeight: 'bold', color: "#1976d2" },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
