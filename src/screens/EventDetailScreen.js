import React, { useContext } from 'react';
import { View, Text, Image, StyleSheet, Button, Alert, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { EventContext } from '../EventContext';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EventDetailScreen({ route }) {
  const { event } = route.params;
  const { favorites, toggleFavorite, joinEvent, leaveEvent, user, events } = useContext(EventContext);
  const insets = useSafeAreaInsets();

  const isFavorite = favorites.includes(event.id);
  const image =
    (event.images && event.images[0]?.url) ??
    event.image ??
    event.imageUrl ??
    null;

  {image ? <Image source={{ uri: image }} style={styles.image} /> : null}

  const localEvent = events.find(e => e.id === event.id);
  const isJoined = !!(localEvent && localEvent.asistentes && localEvent.asistentes.includes(user.name));

  const handlePress = () => {
    if (event.type === 'api') {
      let openUrl = event.url;
      try {
        const urlObj = new URL(event.url);
        if (urlObj.hostname.includes('tm7508.net') && urlObj.searchParams.has('u')) {
          openUrl = decodeURIComponent(urlObj.searchParams.get('u'));
        }
      } catch {}
      if (openUrl && openUrl.startsWith('http')) {
        Linking.openURL(openUrl).catch(() => Alert.alert('No se puede abrir el enlace', 'Ha ocurrido un error.'));
      } else {
        Alert.alert('Enlace inválido', 'Este evento no tiene un enlace válido.');
      }
    } else {
      if (!isJoined) {
        joinEvent(event.id);
        Alert.alert('¡Genial!', 'Te has apuntado a este evento.');
      } else {
        leaveEvent(event.id);
        Alert.alert('Cancelado', 'Ya no vas a este evento.');
      }
    }
  };

  const showMap = event.latitude != null && event.longitude != null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}  // <-- correcto: prop, no hijo
    >
      <TouchableOpacity
        onPress={() => toggleFavorite(event.id, event)}
        style={{ position: 'absolute', right: 20, top: 18, zIndex: 10 }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={{ fontSize: 32 }}>{isFavorite ? '⭐' : '☆'}</Text>
      </TouchableOpacity>

      {image ? <Image source={{ uri: image }} style={styles.image} /> : null}
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.date}>{event.date} | {event.location}</Text>
      <Text style={styles.description}>{event.description || 'Sin descripción'}</Text>

      {showMap && (
        <View style={{ height: 220, borderRadius: 12, overflow: 'hidden', marginVertical: 12 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={{
              latitude: Number(event.latitude),
              longitude: Number(event.longitude),
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
          >
            <Marker
              coordinate={{ latitude: Number(event.latitude), longitude: Number(event.longitude) }}
              title={event.title}
              description={event.location}
            />
          </MapView>
        </View>
      )}

      <View style={{ marginTop: 20, marginBottom: insets.bottom + 12 }}>
        {event.type === 'api' ? (
          <Button title="Comprar entradas" onPress={handlePress} color="#1976d2" />
        ) : (
          <Button title={isJoined ? 'Ya no voy' : '¡Ya voy!'} onPress={handlePress} color={isJoined ? '#d32f2f' : 'green'} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  image: { width: '100%', height: 220, borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, paddingRight: 42 },
  date: { color: '#1976d2', marginBottom: 8 },
  description: { fontSize: 16, marginBottom: 10 },
});
