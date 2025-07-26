import React, { useContext, useState, useEffect } from 'react';
import * as Location from 'expo-location';
import {useColorScheme, View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { EventContext } from '../EventContext';

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

export default function HomeScreen({ navigation }) {
  const { events, favorites, toggleFavorite } = useContext(EventContext);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const colorScheme = useColorScheme();

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

  // Filtrado: busca y muestra solo eventos a menos de 30km (si hay ubicación)
  const filteredEvents = events
    .filter(event =>
      event.title.toLowerCase().includes(search.toLowerCase()) ||
      event.location.toLowerCase().includes(search.toLowerCase())
    )
    .filter(event =>
      !location ||
      (event.latitude && event.longitude &&
        getDistanceKm(location.latitude, location.longitude, event.latitude, event.longitude) < 30)
    );

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => navigation.navigate('EventDetail', { event: item })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.eventTitle}>{item.title}</Text>
        <TouchableOpacity
          onPress={() => toggleFavorite(item.id)}
          style={{ marginLeft: 10 }}
        >
          <Text style={{ fontSize: 22 }}>
            {favorites.includes(item.id) ? '⭐' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text>
        {item.date} - {item.location}
        {location && item.latitude && item.longitude
          ? ` (${getDistanceKm(location.latitude, location.longitude, item.latitude, item.longitude).toFixed(1)} km)`
          : ''}
      </Text>
      <Text numberOfLines={2} style={styles.eventDesc}>{item.description}</Text>
    </TouchableOpacity>
  );

  if (loadingLocation) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#888" />
        <Text>Buscando ubicación...</Text>
      </View>
    );
  }
  const theme = colorScheme === 'dark'
    ? {
        background: '#18181A',
        text: '#fff',
        card: '#232327',
        input: '#232327',
        border: '#444'
      }
    : {
        background: '#fff',
        text: '#18181A',
        card: '#f4f4f4',
        input: '#f8f8f8',
        border: '#ccc'
      };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Eventos cerca de ti</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar por título o lugar..."
        placeholderTextColor={colorScheme === 'dark' ? '#aaa' : '#888'}
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filteredEvents}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No hay eventos cercanos.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  searchInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 8, marginBottom: 16, fontSize: 16, backgroundColor: '#f8f8f8'
  },
  eventCard: {
    backgroundColor: '#f4f4f4', borderRadius: 12,
    padding: 16, marginBottom: 16, elevation: 2,
  },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  eventDesc: { color: '#666', marginTop: 8 },
});
