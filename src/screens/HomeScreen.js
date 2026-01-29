import React, { useContext, useEffect, useState, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, TextInput, ActivityIndicator, Dimensions, Button, ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './HomeScreen.styles';
import { AuthContext } from '../context/AuthContext';
import { Image as ExpoImage } from 'expo-image';
import { requestNotificationPermission, sendTestNotification } from '../utils/notifications';

// ✅ AdMob Banner
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

const TICKETMASTER_API_KEY = 'jIIdDB9mZI5gZgJeDdeESohPT4Pl0wdi';

// Category definitions with icons and colors
const CATEGORIES = [
  {
    id: 'Música',
    name: 'Música',
    icon: 'musical-notes',
    color: '#FF6B6B',
    image: require('../../assets/iconoApp.png'),
  },
  {
    id: 'Deportes',
    name: 'Deportes',
    icon: 'football',
    color: '#4ECDC4',
    image: require('../../assets/iconoApp.png'),
  },
  {
    id: 'Arte',
    name: 'Arte',
    icon: 'brush',
    color: '#FFE66D',
    image: require('../../assets/iconoApp.png'),
  },
  {
    id: 'Tecnología',
    name: 'Tecnología',
    icon: 'laptop',
    color: '#95E1D3',
    image: require('../../assets/iconoApp.png'),
  },
  {
    id: 'Educación',
    name: 'Educación',
    icon: 'school',
    color: '#A8E6CF',
    image: require('../../assets/iconoApp.png'),
  },
  {
    id: 'Gastronomía',
    name: 'Gastronomía',
    icon: 'restaurant',
    color: '#FF8C94',
    image: require('../../assets/iconoApp.png'),
  },
  {
    id: 'Cine',
    name: 'Cine',
    icon: 'film',
    color: '#A29BFE',
    image: require('../../assets/iconoApp.png'),
  },
  {
    id: 'Otro',
    name: 'Otro',
    icon: 'star',
    color: '#DDA0DD',
    image: require('../../assets/iconoApp.png'),
  },
];

// ✅ Banner component (aislado para no tocar tu lógica)
function HomeBannerAd() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const unitId = TestIds.BANNER; // ✅ TEST mientras pruebas

  return (
    <View style={{ alignItems: "center", marginTop: 10, marginBottom: 8 }}>
      {/* ✅ Fallback si no carga / no hay fill */}
      {(!loaded || failed) && (
        <TouchableOpacity
          activeOpacity={0.9}
          style={{
            width: 320,
            height: 50,
            borderRadius: 10,
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 12,
          }}
          onPress={() => {
            // aquí puedes navegar a tu pantalla premium, o abrir un link, etc.
            // navigation.navigate("CreateEventScreen");
          }}
        >
          <Text style={{ fontWeight: "700" }}>🎉 Descubre eventos cerca de ti</Text>
          <Text style={{ fontSize: 12, opacity: 0.8 }}>Publicidad / Promoción</Text>
        </TouchableOpacity>
      )}

      {/* ✅ AdMob */}
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => {
          setLoaded(true);
          setFailed(false);
        }}
        onAdFailedToLoad={(err) => {
          setFailed(true);
          setLoaded(false);
          // si quieres ver el error:
          // console.log("Banner error:", err);
        }}
      />
    </View>
  );
}

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
      const loc = await Location.getCurrentPositionAsync({});
      setLoadingLocation(false);
    })();
  }, []);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Get upcoming events and filter out own events
  const upcomingEvents = useMemo(() => {
    return communityEvents
      .filter(ev => isUpcoming(ev.date))
      .filter(ev => {
        if (!myUserId) return true;
        const createdByRaw = ev.created_by ?? ev.createdById ?? ev.createdBy ?? null;
        return createdByRaw == null ? true : String(createdByRaw) !== myUserId;
      });
  }, [communityEvents, myUserId]);

  // Count events by category
  const categoryCounts = useMemo(() => {
    const counts = {};
    CATEGORIES.forEach(cat => {
      counts[cat.id] = upcomingEvents.filter(ev => {
        const eventType = (ev.type_evento || ev.category || ev.type || '').toLowerCase().trim();
        return eventType === cat.id.toLowerCase() || !eventType && cat.id === 'Otro';
      }).length;
    });
    return counts;
  }, [upcomingEvents]);

  const handleCategoryPress = (category) => {
    navigation.navigate('CategoryEvents', { category: category.name });
  };

  const renderCategoryGrid = ({ item }) => (
    <CategoryCard
      category={item}
      eventCount={categoryCounts[item.id] || 0}
      onPress={() => handleCategoryPress(item)}
    />
  );

  if (loadingLocation) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1976d2" />
        <Text style={{ marginTop: 12, color: '#1976d2', fontWeight: '600' }}>Cargando eventos...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>

      {/* ✅ Contenido principal */}
      <View style={styles.container}>
        <Text style={styles.header}>Explora categorías</Text>
        <Text style={styles.subtitle}>Encuentra eventos que te interesen</Text>

        <FlatList
          data={CATEGORIES}
          keyExtractor={item => item.id}
          renderItem={renderCategoryGrid}
          numColumns={2}
          scrollEnabled={true}
          contentContainerStyle={styles.categoriesGridContent}
          columnWrapperStyle={{
            justifyContent: 'space-around',
            paddingHorizontal: 12,
            marginBottom: 12
          }}
          showsVerticalScrollIndicator={false}
        />

        <TouchableOpacity
          style={styles.fab}
          onPress={() => navigation.navigate('CreateEventScreen')}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ✅ Banner fijo abajo */}
      <HomeBannerAd />

    </View>
  );

}

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
