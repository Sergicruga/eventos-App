import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function EventDetailScreen({ route }) {
  // Recibimos el evento desde la navegación
  const { event } = route.params || {};

  if (!event) {
    // Si no hay evento, muestra mensaje de error (por si se entra mal)
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Evento no encontrado</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.label}>Fecha:</Text>
      <Text style={styles.value}>{event.date}</Text>
      <Text style={styles.label}>Lugar:</Text>
      <Text style={styles.value}>{event.location}</Text>
      <Text style={styles.label}>Descripción:</Text>
      <Text style={styles.value}>{event.description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  label: { fontWeight: 'bold', marginTop: 16 },
  value: { fontSize: 16, marginTop: 4 }
});
