import React, { useContext, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EventContext } from '../EventContext';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './HomeScreen.styles';
import { AuthContext } from '../context/AuthContext';
import { Image as ExpoImage } from 'expo-image';
import {
  eventMatchesCategory,
  eventMatchesSubcategory,
  findCategoryBySlug,
  getSubcategoriesForCategory,
} from '../constants/categories';
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
  const locationFilteredEvents = eventCtx.locationFilteredEvents ?? eventCtx.events ?? [];
  const {
    favorites = [],
    toggleFavorite = () => {},
    getEventImageSource = () => ({ uri: 'https://via.placeholder.com/800x450.png?text=Evento' }),
    getEffectiveEventImage = () => null,
  } = eventCtx;
  const { user } = useContext(AuthContext);
  const [search, setSearch] = useState('');
  const [activeSubcategory, setActiveSubcategory] = useState('todos');
  const navigation = useNavigation();
  const myUserId = user?.id != null ? String(user.id) : null;

  const isCreatedByMe = (ev) => {
    if (!myUserId) return false;
    const createdByRaw = ev.created_by ?? ev.createdById ?? ev.createdBy ?? null;
    return createdByRaw != null && String(createdByRaw) === myUserId;
  };

  // Filter events by category
  const categoryEvents = useMemo(() => {
    return locationFilteredEvents
      .filter(ev => isUpcoming(ev.date))
      .filter(ev => !isCreatedByMe(ev))
      .filter(ev => eventMatchesCategory(ev, activeSlug));
  }, [locationFilteredEvents, activeSlug, myUserId, favorites]);

  const subcategories = useMemo(() => getSubcategoriesForCategory(activeSlug), [activeSlug]);

  const subcategoryCounts = useMemo(() => {
    const counts = { todos: categoryEvents.length };
    subcategories.forEach((sub) => {
      counts[sub.slug] = categoryEvents.filter((event) =>
        eventMatchesSubcategory(event, sub.slug)
      ).length;
    });
    return counts;
  }, [categoryEvents, subcategories]);

  // Filter by search
  const filteredEvents = useMemo(() => {
    return categoryEvents
      .filter(e => eventMatchesSubcategory(e, activeSubcategory))
      .filter(e =>
        (e.title || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.location || '').toLowerCase().includes(search.toLowerCase()) ||
        (e.subcategory_name || '').toLowerCase().includes(search.toLowerCase())
      );
  }, [categoryEvents, search, activeSubcategory]);

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
    if (
      String(ev.type) === 'api' ||
      ['ticketmaster', 'atrapalo'].includes(String(ev.source))
    ) {
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
      {subcategories.length > 0 && (
        <View style={subcategoryStyles.bar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={subcategoryStyles.scroll}
            contentContainerStyle={subcategoryStyles.scrollContent}
          >
            {[{ slug: 'todos', name: 'Todos' }, ...subcategories].map((sub) => {
              const selected = activeSubcategory === sub.slug;
              const count = subcategoryCounts[sub.slug] || 0;
              return (
                <TouchableOpacity
                  key={sub.slug}
                  onPress={() => setActiveSubcategory(sub.slug)}
                  activeOpacity={0.85}
                  style={[
                    subcategoryStyles.chip,
                    selected && subcategoryStyles.chipSelected,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      subcategoryStyles.chipText,
                      selected && subcategoryStyles.chipTextSelected,
                    ]}
                  >
                    {sub.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      subcategoryStyles.chipCount,
                      selected && subcategoryStyles.chipCountSelected,
                    ]}
                  >
                    {count}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
      <FlatList
        data={deduped}
        keyExtractor={item => String(item.id)}
        renderItem={renderItem}
        numColumns={2}
        style={subcategoryStyles.list}
        contentContainerStyle={[styles.listContent, subcategoryStyles.listContent]}
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

const subcategoryStyles = StyleSheet.create({
  bar: {
    height: 52,
    justifyContent: 'center',
    marginBottom: 14,
    backgroundColor: '#f3f6fc',
    zIndex: 5,
    elevation: 5,
  },
  scroll: {
    height: 44,
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  list: {
    flex: 1,
    zIndex: 0,
    elevation: 0,
  },
  listContent: {
    alignItems: 'center',
    paddingTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 88,
    maxWidth: 190,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D8E0F0',
  },
  chipSelected: {
    backgroundColor: '#3B5BA9',
    borderColor: '#3B5BA9',
  },
  chipText: {
    flexShrink: 1,
    color: '#27496D',
    fontWeight: '700',
    fontSize: 14,
  },
  chipTextSelected: {
    color: '#fff',
  },
  chipCount: {
    flexShrink: 0,
    color: '#8AA0BF',
    marginLeft: 6,
    fontWeight: '700',
    fontSize: 13,
  },
  chipCountSelected: {
    color: '#E7EEFF',
  },
});
