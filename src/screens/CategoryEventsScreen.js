import React, { useContext, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EventContext } from '../EventContext';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './HomeScreen.styles';
import { AuthContext } from '../context/AuthContext';
import { Image as ExpoImage } from 'expo-image';
import { EVENT_CATEGORIES, eventMatchesCategory, findCategoryBySlug } from '../constants/categories';
import { isUpcoming, formatDateDMY } from '../utils/dateHelpers';

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
          onError={() => setThumbFallback(true)}
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

export default function CategoryEventsScreen({ route }) {
  const { category, categorySlug } = route.params;
  // Support both old format (category name) and new format (slug)
  const activeSlug = categorySlug || findCategoryBySlug(category)?.slug || 'otro';
  const activeCategory = findCategoryBySlug(activeSlug);
  const eventCtx = useContext(EventContext) || {};
  const communityEvents = eventCtx.communityEvents ?? eventCtx.events ?? [];
  const {
    favorites = [],
    toggleFavorite = () => {},
    getEventImageSource = () => ({ uri: 'https://via.placeholder.com/800x450.png?text=Evento' }),
    getEffectiveEventImage = () => null,
  } = eventCtx;
  const { user } = useContext(AuthContext);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(null);
  const navigation = useNavigation();
  const myUserId = user?.id != null ? String(user.id) : null;

  // Filter events by category
  const categoryEvents = useMemo(() => {
    return communityEvents
      .filter(ev => isUpcoming(ev.date))
      .filter(ev => {
        if (!myUserId) return true;
        const createdByRaw = ev.created_by ?? ev.createdById ?? ev.createdBy ?? null;
        return createdByRaw == null ? true : String(createdByRaw) !== myUserId;
      })
      .filter(ev => eventMatchesCategory(ev, activeSlug));
  }, [communityEvents, activeSlug, myUserId, favorites]);

  // Filter by search
  const filteredEvents = useMemo(() => {
    return categoryEvents.filter(e =>
      (e.title || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.location || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [categoryEvents, search]);

  // Remove duplicates; for API / Ticketmaster events we collapse
  // variants (VIP, GA, etc.) by normalizing their title so only the first
  // version is kept.
  const normalizeTitleKey = (title = '') => {
    let t = String(title || '').toLowerCase();
    // strip everything after pipe (e.g., "Title | VIP PACKAGES" → "Title")
    t = t.split('|')[0].trim();
    // strip common ticket type / variant keywords
    t = t.replace(/\b(vip|ga|general admission|packages|package|tickets?|presale|early\s?bird)\b/g, '');
    // remove non-alphanumeric characters (keeps spaces temporarily)
    t = t.replace(/[^a-z0-9\s]/g, '');
    // collapse multiple spaces
    t = t.replace(/\s+/g, ' ').trim();
    return t;
  };

  const deduped = [];
  const seen = new Set();
  for (const ev of filteredEvents) {
    let key;
    if (String(ev.type) === 'api' || String(ev.source) === 'ticketmaster') {
      key = normalizeTitleKey(ev.title);
    } else {
      key = `${ev.type}-${ev.id}`;
    }
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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{activeCategory?.name || 'Eventos'}</Text>
      <View style={styles.searchBarWrapper}>
        <Ionicons name="search" size={20} color="#1976d2" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchBar}
          placeholder="Buscar eventos..."
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
            <Text style={{ color: '#1976d2', marginTop: 8 }}>
              No hay eventos en {activeCategory?.name || 'esta categoría'}.
            </Text>
          </View>
        }
      />
    </View>
  );
}
