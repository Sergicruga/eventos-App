import React, { useContext, useState } from 'react';
import { View, Text, TextInput, Button, FlatList, StyleSheet } from 'react-native';
import { EventContext } from '../EventContext';
import { Alert } from 'react-native';

export default function ProfileScreen() {
  const { user, updateUser, events } = useContext(EventContext);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);

  const handleSave = () => {
    updateUser({ name, email });
    Alert.alert('Perfil actualizado', 'Tu perfil ha sido guardado correctamente.');
    // Opcional: puedes mostrar una alerta de "perfil guardado"
  };

  // Filtrar solo los eventos creados por este usuario
  const userEvents = events.filter(ev => ev.createdBy === user.name);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Perfil de Usuario</Text>
      <TextInput
        style={styles.input}
        placeholder="Nombre"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
      />
      <Button title="Guardar Perfil" onPress={handleSave} />

      <Text style={[styles.title, { fontSize: 18, marginTop: 32 }]}>Tus eventos creados</Text>
      <FlatList
        data={userEvents}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.eventCard}>
            <Text style={styles.eventTitle}>{item.title}</Text>
            <Text style={styles.eventDesc}>{item.date} - {item.location}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: '#999', marginTop: 20 }}>No has creado eventos aún.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 18, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 10, marginBottom: 10, fontSize: 16, backgroundColor: '#f8f8f8'
  },
  eventCard: {
    backgroundColor: '#f4f4f4', borderRadius: 10,
    padding: 12, marginBottom: 12
  },
  eventTitle: { fontWeight: 'bold', fontSize: 16 },
  eventDesc: { color: '#666' },
});
