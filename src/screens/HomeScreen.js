import React, { useContext, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput } from 'react-native';
import { EventContext } from '../EventContext';

export default function HomeScreen({ navigation }) {
  const { events } = useContext(EventContext);
  const [search, setSearch] = useState('');

  // Filtra eventos según búsqueda (por título o lugar)
  const filteredEvents = events.filter(event =>
    event.title.toLowerCase().includes(search.toLowerCase()) ||
    event.location.toLowerCase().includes(search.toLowerCase())
  );

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
      <Text style={styles.title}>Eventos cerca de ti</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar por título o lugar..."
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={filteredEvents}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No hay eventos.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  searchInput: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 8, marginBottom: 16, fontSize: 16, backgroundColor: '#f8f8f8'
  },
  eventCard: {
    backgroundColor: '#f4f4f4', borderRadius: 12,
    padding: 16, marginBottom: 16, elevation: 2,
  },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  eventDesc: { color: '#666', marginTop: 8 },
});
