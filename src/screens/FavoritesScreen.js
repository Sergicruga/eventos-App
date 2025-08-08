import React, { useContext, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { EventContext } from '../EventContext';

export default function FavoritesScreen({ navigation }) {
  const { favorites, favoriteItems } = useContext(EventContext);

  // construye la lista a partir del mapa de snapshots
  const favEvents = useMemo(
    () => favorites.map(id => favoriteItems[id]).filter(Boolean),
    [favorites, favoriteItems]
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.eventCard} onPress={() => navigation.navigate('EventDetail', { event: item })}>
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
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Aún no has marcado favoritos.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
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
