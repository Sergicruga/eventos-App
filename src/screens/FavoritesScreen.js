// src/screens/FavoritesScreen.js
import React, { useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl, Linking, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EventContext } from '../EventContext';
import { AuthContext } from '../context/AuthContext';
import { API_URL } from '../api/config';
import Ionicons from '@expo/vector-icons/Ionicons'; // o 'react-native-vector-icons/Ionicons'

// 🔑 API key de Ticketmaster (para resolver URL si falta)
const TICKETMASTER_API_KEY = 'TU_API_KEY_TICKETMASTER';

// Colores locales para el botón flotante
const COLORS = { accent: '#63605e', white: '#fff', shadow: '#B0BEC5', primary: '#3B5BA9' };

// Convierte rutas relativas a absolutas en base a API_URL
const toAbsoluteUrl = (img) => {
  if (!img || typeof img !== 'string') return null;
  if (/^https?:\/\//i.test(img)) return img;
  const base = API_URL.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  return img.startsWith('/') ? `${base}${img}` : `${base}/${img}`;
};

// Sanea lo mínimo para URL externas
const sanitizeExternalUrl = (u) => {
  if (!u || typeof u !== 'string') return null;
  let s = u.trim();
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = 'https://' + s;
  return s;
};

export default function FavoritesScreen({ navigation }) {
  const { favorites, favoriteItems } = useContext(EventContext);
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverFavs, setServerFavs] = useState([]);
  const [buyUrl, setBuyUrl] = useState(null); // 🔹 URL seleccionada para el botón

  // --- Fetch favoritos del servidor ---
  const fetchServerFavs = useCallback(async (signal) => {
    if (!user?.id) {
      setServerFavs([]);
      return;
    }
    const res = await fetch(`${API_URL}/users/${user.id}/favorites/events`, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Normaliza shape y asegura imagen absoluta
    const mapped = (data || []).map((e) => ({
      id: String(e.id), // <- id interno
      title: e.title || '',
      date: e.event_at?.slice(0, 10) || '',
      location: e.location || '',
      description: e.description || '',
      image: toAbsoluteUrl(e.image || null),
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      type: e.type || 'local',
      // capturamos posibles URLs
      url: e.url || e.purchaseUrl || e.externalUrl || e.buyUrl || null,
      purchaseUrl: e.purchaseUrl || null,
      externalUrl: e.externalUrl || null,
    }));
    setServerFavs(mapped);
  }, [user?.id]);

  // Carga inicial
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);

    (async () => {
      try {
        await fetchServerFavs(controller.signal);
      } catch (e) {
        if (mounted) console.warn('Error cargando favoritos de BD:', e.message);
      } finally {
        clearTimeout(timeout);
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [fetchServerFavs]);

  // Refetch cuando entras a la pantalla (focus)
  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      (async () => {
        try {
          await fetchServerFavs(controller.signal);
        } catch {}
      })();
      return () => controller.abort();
    }, [fetchServerFavs])
  );

  // Refetch si cambian los IDs de favoritos
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        await fetchServerFavs(controller.signal);
      } catch {}
    })();
    return () => controller.abort();
  }, [favorites.join('|'), fetchServerFavs]);

  // Pull-to-refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const controller = new AbortController();
    try {
      await fetchServerFavs(controller.signal);
    } catch {}
    finally {
      setRefreshing(false);
      controller.abort();
    }
  }, [fetchServerFavs]);

  // Normaliza locales a absoluta y guarda también el id externo
  const localMap = useMemo(() => {
    const m = new Map();
    for (const favId of favorites) {
      const ev = favoriteItems[favId];
      if (ev) {
        m.set(String(favId), {
          ...ev,
          externalId: String(ev.externalId ?? ev.tm_id ?? ev.id ?? favId), // intentamos conservar id externo TM si existe
          id: ev.id !== undefined ? String(ev.id) : String(favId),
          image: toAbsoluteUrl(ev.image || null),
          url: ev.url || ev.purchaseUrl || ev.externalUrl || null,
          purchaseUrl: ev.purchaseUrl || null,
          externalUrl: ev.externalUrl || null,
        });
      }
    }
    return m;
  }, [favorites, favoriteItems]);

  // Mapa de server
  const serverMap = useMemo(() => {
    const m = new Map();
    for (const ev of serverFavs) m.set(String(ev.id), ev);
    return m;
  }, [serverFavs]);

  // Fusión local + server
  const favEvents = useMemo(() => {
    const list = [];
    for (const rawId of favorites) {
      const key = String(rawId);
      const local = localMap.get(key);
      const server =
        serverMap.get(key) ||
        (local?.id ? serverMap.get(String(local.id)) : undefined);

      let merged = null;
      if (server && local) {
        merged = {
          ...server,
          ...local,
          id: server.id, // usamos id interno para no romper backend
          externalId: local.externalId || local.id,
          url: local.url || server.url || null,
          purchaseUrl: local.purchaseUrl || server.purchaseUrl || null,
          externalUrl: local.externalUrl || server.externalUrl || null,
        };
      } else if (server) {
        merged = { ...server };
      } else if (local) {
        merged = { ...local };
      }

      if (merged) list.push(merged);
    }
    return list;
  }, [favorites, localMap, serverMap]);

  // --- Resolver URL de compra si falta (antes de navegar)
  const looksLikeTicketmasterId = (id) => {
    if (!id || typeof id !== 'string') return false;
    return !/^\d+$/.test(id) && id.length >= 10; // simple heurística
    // (los ids internos tuyos suelen ser numéricos; los de TM no)
  };

  const resolveBuyUrl = useCallback(async (item) => {
    // 1) si ya tenemos alguna URL, usarla
    const first = item?.url || item?.purchaseUrl || item?.externalUrl || null;
    const sanitized = sanitizeExternalUrl(first);
    if (sanitized) return sanitized;

    // 2) si hay externalId con pinta de TM y tenemos API key -> fetch a TM
    const extId = item?.externalId;
    if (extId && looksLikeTicketmasterId(extId) && TICKETMASTER_API_KEY) {
      try {
        const res = await fetch(
          `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(extId)}.json?apikey=${encodeURIComponent(TICKETMASTER_API_KEY)}`
        );
        if (res.ok) {
          const data = await res.json();
          const url = data?.url || data?.purchaseUrl || null;
          return sanitizeExternalUrl(url);
        }
      } catch (e) {
        // silencioso
      }
    }

    // 3) no hay manera de obtenerla
    return null;
  }, []);

  // ✅ Hook ANTES de cualquier return
  const handleOpenBuy = useCallback(async () => {
    if (!buyUrl) return;
    try {
      const supported = await Linking.canOpenURL(buyUrl);
      if (!supported) return Alert.alert('No se pudo abrir el enlace', buyUrl);
      await Linking.openURL(buyUrl);
    } catch (e) {
      Alert.alert('Enlace no válido', String(e?.message || e));
    }
  }, [buyUrl]);

  if (user?.id && loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Cargando favoritos…</Text>
      </View>
    );
  }

  const renderItem = ({ item }) => {
    const handlePress = async () => {
      const url = await resolveBuyUrl(item);
      const cleanUrl = url || item.url || item.purchaseUrl || item.externalUrl || null;

      setBuyUrl(cleanUrl);

      navigation.navigate('EventDetail', {
        event: {
          ...item,
          url: cleanUrl,
          purchaseUrl: cleanUrl,
          buyUrl: cleanUrl,
          externalUrl: cleanUrl,
          website: cleanUrl,
        },
        buyUrl: cleanUrl, // ✅ pásalo explícito
        eventId: item.id,
        externalId: item.externalId,
      });
    };

    return (
      <TouchableOpacity style={styles.eventCard} onPress={handlePress}>
        {item.image ? <Image source={{ uri: item.image }} style={styles.image} /> : null}
        <Text style={styles.eventTitle}>{item.title || '-'}</Text>
        <Text>{(item.date || '') + (item.location ? ` | ${item.location}` : '')}</Text>
        <Text numberOfLines={2} style={styles.eventDesc}>{item.description || ''}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
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
          contentContainerStyle={{ paddingBottom: 100 }} // deja espacio para el botón flotante
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          extraData={favorites}
        />
      </View>

      {buyUrl ? (
        <TouchableOpacity
          onPress={handleOpenBuy}
          activeOpacity={0.85}
          style={styles.floatingBuyBtn}
          accessibilityLabel="Comprar entradas"
        >
          <Ionicons name="ticket-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
          <Text style={styles.floatingBuyBtnText}>Comprar entradas</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  eventCard: { backgroundColor: '#f4f4f4', borderRadius: 12, padding: 12, marginBottom: 12 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 6 },
  eventDesc: { color: '#666', marginTop: 4 },
  image: { width: '100%', height: 120, borderRadius: 8 },

  // 🔹 Estilos del botón flotante
  floatingBuyBtn: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: COLORS.accent,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  floatingBuyBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },
});
