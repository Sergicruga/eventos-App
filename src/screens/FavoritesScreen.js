import React, { useContext } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { EventContext } from '../EventContext';

export default function FavoritesScreen({ navigation }) {
  const { favorites } = useContext(EventContext);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => navigation.navigate('EventDetail', { event: item })}
    >
      <Text style={styles.eventTitle}>{item.title}</Text>
      <Text>{item.date} - {item.location}</Text>
      <Text numberOfLines={2} style={styles.eventDesc}>{item.description}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tus eventos favoritos</Text>
      <FlatList
        data={favorites}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.type || 'local'}-${String(item.id)}`}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>Aún no has marcado favoritos.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  eventCard: {
    backgroundColor: '#f4f4f4', borderRadius: 12,
    padding: 16, marginBottom: 16, elevation: 2,
  },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  eventDesc: { color: '#666', marginTop: 8 },
});
