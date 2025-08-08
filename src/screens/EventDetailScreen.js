import React, { useContext } from 'react';
import { View, Text, Image, StyleSheet, Button, Alert, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { EventContext } from '../EventContext';

export default function EventDetailScreen({ route }) {
  const { event } = route.params;
  const { favorites, toggleFavorite, joinEvent, leaveEvent, user, events } = useContext(EventContext);

  const isFavorite = favorites.includes(event.id);
  const image = event.images && event.images[0] ? event.images[0].url : event.image || null;

  // ¿El usuario ya se ha apuntado?
  const localEvent = events.find(e => e.id === event.id);
  const isJoined = !!(localEvent && localEvent.asistentes && localEvent.asistentes.includes(user.name));

  const handlePress = () => {
    if (event.type === 'api') {
      let openUrl = event.url;
      try {
        // Si es un enlace de afiliado de ticketmaster, saca la URL limpia
        const urlObj = new URL(event.url);
        if (urlObj.hostname.includes('tm7508.net') && urlObj.searchParams.has('u')) {
          openUrl = decodeURIComponent(urlObj.searchParams.get('u'));
        }
      } catch {}
      if (openUrl && openUrl.startsWith('http')) {
        Linking.openURL(openUrl).catch(() => {
          Alert.alert("No se puede abrir el enlace", "Ha ocurrido un error al abrir el enlace.");
        });
      } else {
        Alert.alert("Enlace inválido", "Este evento no tiene un enlace válido.");
      }
    } else {
      if (!isJoined) {
        joinEvent(event.id);
        Alert.alert("¡Genial!", "Te has apuntado a este evento.");
      } else {
        leaveEvent(event.id);
        Alert.alert("Cancelado", "Ya no vas a este evento.");
      }
    }
  };

  // (Opcional) Mostrar mapa y botón abrir en Google Maps SOLO en eventos locales
  const showMap = event.latitude && event.longitude && event.type !== 'api';

  return (
    <ScrollView style={styles.container}>
      {/* Estrella de favoritos arriba a la derecha */}
      <TouchableOpacity
        onPress={() => toggleFavorite(event)}
        style={{ position: "absolute", right: 20, top: 18, zIndex: 10 }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={{ fontSize: 32 }}>{isFavorite ? '⭐' : '☆'}</Text>
      </TouchableOpacity>

      {image && <Image source={{ uri: image }} style={styles.image} />}
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.date}>{event.date} | {event.location}</Text>
      <Text style={styles.description}>{event.description || "Sin descripción"}</Text>

      {/* (Opcional) Mapa y botón abrir en Maps */}
      {showMap && (
        <View style={{ marginVertical: 14 }}>
          <Button
            title="Ver ubicación en Google Maps"
            color="#1976d2"
            onPress={() => {
              const url = `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}`;
              Linking.openURL(url).catch(() =>
                Alert.alert("No se puede abrir Maps", "Comprueba tu conexión.")
              );
            }}
          />
        </View>
      )}

      <View style={{ marginVertical: 28 }}>
        {/* Botón para comprar entradas o apuntarse/desapuntarse */}
        {event.type === 'api' ? (
          <Button
            title="Comprar entradas"
            onPress={handlePress}
            color="#1976d2"
          />
        ) : (
          <Button
            title={isJoined ? "Ya no voy" : "¡Ya voy!"}
            onPress={handlePress}
            color={isJoined ? "#d32f2f" : "green"}
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  image: { width: "100%", height: 220, borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 8, paddingRight: 42 }, // deja espacio para la estrella
  date: { color: "#1976d2", marginBottom: 8 },
  description: { fontSize: 16, marginBottom: 10 }
});
