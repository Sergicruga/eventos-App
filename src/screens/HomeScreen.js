import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './HomeScreen.styles';
import { API_URL } from '../api/config';


const TICKETMASTER_API_KEY = 'jIIdDB9mZI5gZgJeDdeESohPT4Pl0wdi';
const DEFAULT_EVENT_IMAGE = "https://via.placeholder.com/800x450.png?text=Evento";
const toAbsoluteImage = (img) => {
  if (!img || String(img).trim() === "") return DEFAULT_EVENT_IMAGE;
  // si ya es absoluta (http/https), tal cual
  if (/^https?:\/\//i.test(img)) return img;
  // si viniera relativa desde tu API (p.ej. "/uploads/.."), prépéndele API_URL
  try {
    const { API_URL } = require('../api/config');
    return `${API_URL}${img}`;
  } catch {
    return DEFAULT_EVENT_IMAGE;
  }
};

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

async function fetchTicketmasterEvents(city = 'Barcelona') {
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TICKETMASTER_API_KEY}&countryCode=ES&city=${encodeURIComponent(city)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data._embedded?.events || [];
}

const CARD_MARGIN = 10;
const CARD_WIDTH = (Dimensions.get('window').width - CARD_MARGIN * 3) / 2;

export default function HomeScreen() {
  const { communityEvents, favorites, toggleFavorite } = useContext(EventContext);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [apiEvents, setApiEvents] = useState([]);
  const [loadingApiEvents, setLoadingApiEvents] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
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
    ...communityEvents.map(ev => ({ ...ev, type: 'local' })),
    ...apiEvents.map(ev => {
      const venue = ev._embedded?.venues?.[0];
      const lat = venue?.location?.latitude ? parseFloat(venue.location.latitude) : null;
      const lon = venue?.location?.longitude ? parseFloat(venue.location.longitude) : null;
      return {
        id: `tm-${ev.id}`,
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
        getDistanceKm(location.latitude, location.longitude, e.latitude, e.longitude) < 1000)
    );

  // Elimina duplicados por (type-id)
  const deduped = [];
  const seen = new Set();
  for (const ev of filteredEvents) {
    const key = `${ev.type}-${ev.id}`;
    if (!seen.has(key)) {
      deduped.push(ev);
      seen.add(key);
    }
  }

  function renderEventCard({ item }) {
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => navigation.navigate('EventDetail', { event: item })}
      >
        <View style={styles.imageWrapper}>
          <Image
            source={item.image ? { uri: item.image } : require('../../assets/iconoApp.png')}
            style={styles.cardImage}
            resizeMode="cover"
          />
          <Image
            source={{ uri: toAbsoluteImage(item.image) }}
            style={styles.cardImage}
            resizeMode="cover"
            defaultSource={require('../../assets/iconoApp.png')} // Android: placeholder local mientras carga
         />
          <LinearGradient
            colors={['transparent', 'rgba(35,69,103,0.45)', 'rgba(35,69,103,0.7)']}
            style={styles.gradientOverlay}
          />
          <TouchableOpacity
            style={styles.favoriteIcon}
            onPress={() => toggleFavorite(item.id, item)}
          >
            <Ionicons
              name={favorites.includes(item.id) ? 'star' : 'star-outline'}
              size={24}
              color={favorites.includes(item.id) ? '#FFD700' : '#5a7bb6'}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.overlay}>
          <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">
            {item.title}
          </Text>
          <Text style={styles.cardDate} numberOfLines={1} ellipsizeMode="tail">
            {item.date}
          </Text>
          <Text style={styles.cardLocation} numberOfLines={1} ellipsizeMode="tail">
            <Ionicons name="location-outline" size={14} color="#5a7bb6" /> {item.location}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (loadingLocation || loadingApiEvents) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={{ marginTop: 12, color: '#1976d2', fontWeight: '600' }}>Cargando eventos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Eventos cerca de ti</Text>
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search" size={20} color="#1976d2" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchBar}
          placeholder="Buscar eventos, ciudades..."
          placeholderTextColor="#1976d2"
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={deduped}
        keyExtractor={item => item.id}
        renderItem={renderEventCard}
        numColumns={2}
        contentContainerStyle={[styles.listContent, { alignItems: 'center' }]} // Add alignItems: 'center'
        columnWrapperStyle={{ justifyContent: 'center' }} // Center cards in each row
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="sad-outline" size={48} color="#1976d2" />
            <Text style={{ color: '#1976d2', marginTop: 8 }}>No se encontraron eventos.</Text>
          </View>
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateEventScreen')}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
