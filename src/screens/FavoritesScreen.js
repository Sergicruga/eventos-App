// src/screens/FavoritesScreen.js
import React, { useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { EventContext } from '../EventContext';
import { AuthContext } from '../context/AuthContext';
import { API_URL } from '../api/config';

// Convierte rutas relativas a absolutas en base a API_URL
const toAbsoluteUrl = (img) => {
  if (!img || typeof img !== 'string') return null;
  if (/^https?:\/\//i.test(img)) return img;
  const base = API_URL.replace(/\/api\/?$/i, '').replace(/\/+$/, '');
  return img.startsWith('/') ? `${base}${img}` : `${base}/${img}`;
};

export default function FavoritesScreen({ navigation }) {
  const { favorites, favoriteItems } = useContext(EventContext);
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [serverFavs, setServerFavs] = useState([]); // eventos completos desde BD

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
      id: String(e.id), // <- ESTE es el id interno (numérico en texto)
      title: e.title || '',
      date: e.event_at?.slice(0, 10) || '',
      location: e.location || '',
      description: e.description || '',
      image: toAbsoluteUrl(e.image || null),
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      type: e.type || 'local',
      // si tu API ya manda external_id/source, podrías añadirlos aquí
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
  }, [favorites.join('|'), fetchServerFavs]); // join para dependencia estable

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

  // Normaliza locales a absoluta y guarda también el id externo como externalId
  const localMap = useMemo(() => {
    const m = new Map();
    for (const favId of favorites) {
      const ev = favoriteItems[favId];
      if (ev) {
        m.set(String(favId), {
          ...ev,
          // OJO: aquí no tocamos el id original local; lo guardamos aparte
          externalId: String(ev.id ?? favId),  // p.ej. "tm-..."
          id: ev.id !== undefined ? String(ev.id) : String(favId), // se sobreescribirá por el server si existe
          image: toAbsoluteUrl(ev.image || null),
        });
      }
    }
    return m;
  }, [favorites, favoriteItems]);

  // Mapa de server por id interno (numérico en string)
  const serverMap = useMemo(() => {
    const m = new Map();
    for (const ev of serverFavs) m.set(String(ev.id), ev);
    return m;
  }, [serverFavs]);

  // 🔑 Fuente de verdad: SOLO los IDs presentes en `favorites`
  // Para cada id, buscamos en local y en server; si hay server, **forzamos** que el `id` final sea el del server
  const favEvents = useMemo(() => {
    const list = [];
    for (const rawId of favorites) {
      const key = String(rawId);
      const local = localMap.get(key);
      // intenta casar por 3 vías:
      // 1) el propio rawId coincide con id server
      // 2) el id local coincide con id server
      // 3) (si existe) externalId local coincide con algún server (opcional)
      const server =
        serverMap.get(key) ||
        (local?.id ? serverMap.get(String(local.id)) : undefined);

      let merged = null;
      if (server && local) {
        merged = {
          ...server,
          ...local,
          id: server.id,                 // <-- fuerza id INTERNO (numérico) para no romper backend
          externalId: local.externalId || local.id, // conserva el externo si interesa
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

  if (user?.id && loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Cargando favoritos…</Text>
      </View>
    );
  }

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.eventCard}
      // Mandamos ambos ids al detalle por si lo necesitas (interno y externo)
      onPress={() => navigation.navigate('EventDetail', { event: item, eventId: item.id, externalId: item.externalId })}
    >
      {item.image ? <Image source={{ uri: item.image }} style={styles.image} /> : null}
      <Text style={styles.eventTitle}>{item.title || '-'}</Text>
      <Text>{(item.date || '') + (item.location ? ` | ${item.location}` : '')}</Text>
      <Text numberOfLines={2} style={styles.eventDesc}>{item.description || ''}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tus eventos favoritos</Text>
      <FlatList
        data={favEvents}
        renderItem={renderItem}
        keyExtractor={(item) => String(item.id)}  // ahora `id` será el interno si existe
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 20 }}>
            {user?.id ? 'Aún no has marcado favoritos.' : 'Inicia sesión para ver tus favoritos.'}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        extraData={favorites}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  eventCard: { backgroundColor: '#f4f4f4', borderRadius: 12, padding: 12, marginBottom: 12 },
  eventTitle: { fontSize: 16, fontWeight: 'bold', marginTop: 6 },
  eventDesc: { color: '#666', marginTop: 4 },
  image: { width: '100%', height: 120, borderRadius: 8 },
});
