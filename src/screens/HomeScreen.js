import React, { useContext, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './HomeScreen.styles';
import { AuthContext } from '../context/AuthContext';
import { requestNotificationPermission } from '../utils/notifications';
import { EVENT_CATEGORIES, eventMatchesCategory } from '../constants/categories';
import { isUpcoming } from '../utils/dateHelpers';

// ✅ AdMob Banner
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const TICKETMASTER_API_KEY = 'jIIdDB9mZI5gZgJeDdeESohPT4Pl0wdi';

// Category Card Component
function CategoryCard({ category, onPress, eventCount }) {
  return (
    <TouchableOpacity
      style={[styles.categoryCard, { backgroundColor: category.color }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <LinearGradient
        colors={[category.color, `${category.color}cc`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.categoryGradient}
      >
        <View style={styles.categoryIconWrapper}>
          <Ionicons name={category.icon} size={48} color="#fff" />
        </View>
        <Text style={styles.categoryName}>{category.name}</Text>
        <Text style={styles.categoryCount}>{eventCount} eventos</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const eventCtx = useContext(EventContext) || {};
  const communityEvents = eventCtx.communityEvents ?? eventCtx.events ?? [];
  const { user } = useContext(AuthContext);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const navigation = useNavigation();
  const myUserId = user?.id != null ? String(user.id) : null;

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLoadingLocation(false);
        return;
      }
      await Location.getCurrentPositionAsync({});
      setLoadingLocation(false);
    })();
  }, []);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Get upcoming events and filter out own events
  const upcomingEvents = useMemo(() => {
    return communityEvents
      .filter((ev) => isUpcoming(ev.date))
      .filter((ev) => {
        if (!myUserId) return true;
        const createdByRaw = ev.created_by ?? ev.createdById ?? ev.createdBy ?? null;
        return createdByRaw == null ? true : String(createdByRaw) !== myUserId;
      });
  }, [communityEvents, myUserId]);

  // Count events by category
  const categoryCounts = useMemo(() => {
    const counts = {};
    EVENT_CATEGORIES.forEach((cat) => {
      counts[cat.slug] = upcomingEvents.filter((ev) => eventMatchesCategory(ev, cat.slug)).length;
    });
    return counts;
  }, [upcomingEvents]);

  const handleCategoryPress = (category) => {
    navigation.navigate('CategoryEvents', { category: category.slug, categoryName: category.name });
  };

  const renderCategoryGrid = ({ item }) => (
    <CategoryCard
      category={item}
      eventCount={categoryCounts[item.slug] || 0}
      onPress={() => handleCategoryPress(item)}
    />
  );

  if (loadingLocation) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={{ marginTop: 12, color: '#1976d2', fontWeight: '600' }}>
          Cargando eventos...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Explora categorías</Text>
      <Text style={styles.subtitle}>Encuentra eventos que te interesen</Text>

      <FlatList
        data={EVENT_CATEGORIES}
        keyExtractor={(item) => item.slug}
        renderItem={renderCategoryGrid}
        numColumns={2}
        scrollEnabled={true}
        // ✅ sin tocar tu estilo: solo añadimos un paddingBottom para que el banner no tape nada
        contentContainerStyle={[styles.categoriesGridContent, { paddingBottom: 80 }]}
        columnWrapperStyle={{
          justifyContent: 'space-around',
          paddingHorizontal: 12,
          marginBottom: 12,
        }}
        showsVerticalScrollIndicator={false}
      />

      {/* ✅ BANNER FIJO ABAJO (TEST) */}
      <View style={{ alignItems: 'center' }}>
        <BannerAd
          unitId="ca-app-pub-9396892293971176/3865947873"
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          onAdLoaded={() => console.log('✅ Banner REAL cargado')}
          onAdFailedToLoad={(err) => console.log('❌ Banner REAL error', err)}
        />

      </View>

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
