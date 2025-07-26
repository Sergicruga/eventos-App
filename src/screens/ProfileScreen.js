import React, { useContext } from 'react';
import { useColorScheme, View, Text, StyleSheet } from 'react-native';
import { EventContext } from '../EventContext';

export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark'
    ? {
        background: '#18181A',
        text: '#fff',
        card: '#232327'
      }
    : {
        background: '#fff',
        text: '#18181A',
        card: '#f4f4f4'
      };

  const { user } = useContext(EventContext);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>Perfil de Usuario</Text>
      <View style={[styles.card, { backgroundColor: theme.card }]}>
        <Text style={[styles.label, { color: theme.text }]}>Nombre:</Text>
        <Text style={{ color: theme.text }}>{user.name}</Text>
        <Text style={[styles.label, { color: theme.text, marginTop: 14 }]}>Correo:</Text>
        <Text style={{ color: theme.text }}>{user.email || 'Sin email'}</Text>
      </View>
      <Text style={{ color: theme.text, marginTop: 24, fontSize: 13, opacity: 0.7 }}>
        Más funcionalidades aquí próximamente...
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  card: {
    width: '100%',
    borderRadius: 16,
    padding: 18,
    alignItems: 'flex-start',
    elevation: 3,
    marginTop: 10,
  },
  label: { fontWeight: 'bold', fontSize: 16 },
});
