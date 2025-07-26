import React, { useContext } from 'react';
import { useColorScheme, View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { EventContext } from '../EventContext';

export default function FavoritesScreen({ navigation }) {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark'
    ? {
        background: '#18181A',
        text: '#fff',
        card: '#232327',
        border: '#444'
      }
    : {
        background: '#fff',
        text: '#18181A',
        card: '#f4f4f4',
        border: '#ccc'
      };

  const { events, favorites } = useContext(EventContext);
  const favEvents = events.filter(e => favorites.includes(e.id));

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.eventCard, { backgroundColor: theme.card }]}
      onPress={() => navigation.navigate('EventDetail', { event: item })}
    >
      <Text style={[styles.eventTitle, { color: theme.text }]}>{item.title}</Text>
      <Text style={{ color: theme.text }}>{item.date} - {item.location}</Text>
      <Text numberOfLines={2} style={[styles.eventDesc, { color: colorScheme === 'dark' ? '#aaa' : '#666' }]}>{item.description}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Tus eventos favoritos</Text>
      <FlatList
        data={favEvents}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        ListEmptyComponent={<Text style={{ color: theme.text, textAlign: 'center', marginTop: 20 }}>Aún no has marcado favoritos.</Text>}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  eventCard: {
    borderRadius: 12,
    padding: 16, marginBottom: 16, elevation: 2,
  },
  eventTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  eventDesc: { marginTop: 8 },
});
