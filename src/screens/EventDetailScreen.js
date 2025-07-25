import React, { useContext } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Button } from 'react-native';
import { EventContext } from '../EventContext';

function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lat2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function EventDetailScreen({ route, navigation }) {
  const { events,favorites, toggleFavorite, joinEvent, leaveEvent, user } = useContext(EventContext);
  const eventId = route.params.event.id;
  const event = events.find(e => e.id === eventId) || route.params.event;

  const asistentes = event.asistentes || [];
  const yaApuntado = asistentes.includes(user.name);

  // Si tienes la localización del usuario en contexto, puedes calcular la distancia aquí.
  // Si no, simplemente no muestres la distancia.

  return (
    <ScrollView style={styles.container}>
      {event.imageUrl ? (
        <Image source={{ uri: event.imageUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, { backgroundColor: "#ddd", justifyContent: "center", alignItems: "center" }]}>
          <Text style={{ color: "#999" }}>Sin imagen</Text>
        </View>
      )}
      <View style={styles.header}>
        <Text style={styles.title}>{event.title}</Text>
        <TouchableOpacity onPress={() => toggleFavorite(event.id)}>
          <Text style={{ fontSize: 30, marginLeft: 10 }}>
            {favorites.includes(event.id) ? '⭐' : '☆'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.info}>
        {event.date} — {event.location}
        {event.latitude && event.longitude
          ? `\n(${event.latitude.toFixed(4)}, ${event.longitude.toFixed(4)})`
          : ''}
      </Text>
      <Text style={styles.desc}>{event.description}</Text>
      {/* --- BOTÓN ¡VOY! / DESAPUNTARSE --- */}
      <View style={{ marginHorizontal: 16, marginVertical: 10 }}>
        {yaApuntado ? (
          <Button
            title="¡Ya no voy!"
            color="#ff4d4d"
            onPress={() => leaveEvent(event.id)}
          />
        ) : (
          <Button
            title="¡Voy!"
            color="#4caf50"
            onPress={() => joinEvent(event.id)}
          />
        )}
      </View>

      {/* --- LISTA DE ASISTENTES --- */}
      <View style={styles.assistantsBox}>
        <Text style={styles.assistantsTitle}>Asistentes:</Text>
        {event.asistentes && event.asistentes.length > 0 ? (
          event.asistentes.map((name, i) => (
            <Text key={i} style={styles.assistant}>{name}</Text>
          ))
        ) : (
          <Text style={styles.assistant}>Nadie se ha apuntado aún.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  image: { width: "100%", height: 180, marginBottom: 14, borderRadius: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16 },
  title: { fontSize: 24, fontWeight: 'bold', flex: 1 },
  info: { fontSize: 16, color: "#666", marginHorizontal: 16, marginBottom: 10 },
  desc: { fontSize: 16, marginHorizontal: 16, marginBottom: 32, color: "#333" },
  assistantsBox: {backgroundColor: "#f9f9f9", marginHorizontal: 16, borderRadius: 8,
      padding: 12, marginBottom: 32, marginTop: 12, },
  assistantsTitle: { fontWeight: "bold", fontSize: 16, marginBottom: 6 },
  assistant: { color: "#333", marginBottom: 3 },
});
