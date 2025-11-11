import React, { useContext, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, TextInput, ActivityIndicator, Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './HomeScreen.styles';
import { AuthContext } from '../context/AuthContext';
import { Image as ExpoImage } from 'expo-image';

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

async function fetchTicketmasterEvents(city = 'Barcelona', monthsAhead = 6) {
  const baseUrl = 'https://app.ticketmaster.com/discovery/v2/events.json';
  const toIsoNoMs = (d) => d.toISOString().split('.')[0] + 'Z';

  const now = new Date();
  const start = new Date(now); // desde ahora
  const end = new Date(now);
  end.setMonth(end.getMonth() + monthsAhead); // +6 meses

  const params = new URLSearchParams({
    apikey: TICKETMASTER_API_KEY,
    countryCode: 'ES',
    city: city,
    startDateTime: toIsoNoMs(start),
    endDateTime: toIsoNoMs(end),
    sort: 'date,asc',
    size: '100',
  });

  const events = [];
  for (let page = 0; page < 5; page++) { // hasta 5 páginas (~500 items)
    params.set('page', String(page));
    const url = `${baseUrl}?${params.toString()}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const batch = data._embedded?.events ?? [];
      events.push(...batch);

      const pg = data.page;
      if (!pg || pg.number + 1 >= pg.totalPages || batch.length === 0) break;
    } catch {
      break;
    }
  }
  return events;
}

const CARD_MARGIN = 10;
const CARD_WIDTH = (Dimensions.get('window').width - CARD_MARGIN * 3) / 2;

// --- NUEVO: helpers de fecha para ocultar pasados ---
function toLocalMidnightMs(dateStr) {
  if (!dateStr) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    const [_, y, mm, dd] = m;
    return new Date(Number(y), Number(mm) - 1, Number(dd), 0, 0, 0, 0).getTime();
  }
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return NaN;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}
function todayLocalMidnightMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
}
function isUpcoming(dateStr) {
  const e = toLocalMidnightMs(dateStr);
  const t = todayLocalMidnightMs();
  return !Number.isNaN(e) && e >= t;
}

// Formatea "YYYY-MM-DD" (u otras variantes) a "DD - MM - YYYY"
function formatDateDMY(dateStr) {
  if (!dateStr) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const m2 = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(dateStr);
  if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
  const d = new Date(dateStr);
  if (!isNaN(d)) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }
  return dateStr;
}

/** Card hija (puede usar hooks propios sin romper FlatList) */
function EventCard({ item, isFavorite, onToggleFavorite, onPress, getEventImageSource, effectiveImage }) {
  const [thumbFallback, setThumbFallback] = React.useState(false);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.88} onPress={onPress}>
      <View style={styles.imageWrapper}>
        <ExpoImage
          source={
            effectiveImage
              ? getEventImageSource(effectiveImage)
              : require('../../assets/iconoApp.png')
          }
          style={styles.cardImage}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          onError={() => {
            // If the image fails to load, show the placeholder
            setThumbFallback(true);
          }}
        />
        {thumbFallback && (
          <ExpoImage
            source={require('../../assets/iconoApp.png')}
            style={[styles.cardImage, { position: 'absolute', top: 0, left: 0 }]}
            contentFit="cover"
            transition={200}
          />
        )}

        <LinearGradient
          colors={['transparent', 'rgba(35,69,103,0.45)', 'rgba(35,69,103,0.7)']}
          style={styles.gradientOverlay}
        />

        <TouchableOpacity style={styles.favoriteIcon} onPress={() => onToggleFavorite(item.id, item)}>
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={24}
            color={isFavorite ? '#FFD700' : '#5a7bb6'}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.overlay}>
        <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">
          {item.title}
        </Text>
        <Text style={styles.cardDate} numberOfLines={1} ellipsizeMode="tail">
          {formatDateDMY(item.date)}
        </Text>
        <Text style={styles.cardLocation} numberOfLines={1} ellipsizeMode="tail">
          <Ionicons name="location-outline" size={14} color="#5a7bb6" /> {item.location}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { communityEvents, favorites, toggleFavorite, getEventImageSource, getEffectiveEventImage } = useContext(EventContext);
  const { user } = useContext(AuthContext);
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
    fetchTicketmasterEvents('Barcelona', 6) // ahora 6 meses vista (ya viene futuro)
      .then(setApiEvents)
      .catch(() => setApiEvents([]))
      .finally(() => setLoadingApiEvents(false));
  }, []);

  const myUserId = user?.id != null ? String(user.id) : null;

  // --- CAMBIO 1: filtrar SOLO eventos futuros (y seguir excluyendo los míos)
  // También arreglamos el campo de autor (created_by vs createdById)
  const otherUserEvents = communityEvents
    .filter(ev => isUpcoming(ev.date)) // 👈 oculta pasados de BD
    .filter(ev => (ev.type === 'api' ? favorites.includes(String(ev.id)) : true))
    .filter(ev => {
      if (!myUserId) return true;
      const createdByRaw = ev.created_by ?? ev.createdById ?? ev.createdBy ?? null;
      return createdByRaw == null ? true : String(createdByRaw) !== myUserId;
    });

  // TM ya viene acotado por startDateTime>=now, pero aplicamos isUpcoming por seguridad
  const tmProjected = apiEvents
    .map(ev => {
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
    })
    .filter(e => isUpcoming(e.date)); // 👈 oculta cualquiera que estuviera en el pasado por formato/huso

  const allEvents = [
    ...otherUserEvents.map(ev => ({ ...ev, type: 'local' })),
    ...tmProjected,
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

  const renderItem = ({ item }) => {
    const isFav = favorites.includes(String(item.id));
    return (
      <EventCard
        item={item}
        isFavorite={isFav}
        onToggleFavorite={toggleFavorite}
        onPress={() => navigation.navigate('EventDetail', { event: item })}
        getEventImageSource={getEventImageSource}
        effectiveImage={getEffectiveEventImage(item.id, item.image)}
      />
    );
  };

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
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        numColumns={2}
        contentContainerStyle={[styles.listContent, { alignItems: 'center' }]}
        columnWrapperStyle={{ justifyContent: 'center' }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Ionicons name="sad-outline" size={48} color="#1976d2" />
            <Text style={{ color: '#1976d2', marginTop: 8 }}>No se encontraron eventos próximos.</Text>
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
