import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { EventContext } from '../EventContext';

export default function CreateEventScreen({ navigation }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const { addEvent } = useContext(EventContext);

  const handleCreateEvent = () => {
    if (!title || !date || !location || !description) {
      Alert.alert('Faltan datos', 'Por favor, rellena todos los campos');
      return;
    }
    addEvent({ title, date, location, description });
    // Borra los campos después de crear
    setTitle('');
    setDate('');
    setLocation('');
    setDescription('');
    navigation.navigate('Home');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Evento</Text>
      <TextInput
        style={styles.input}
        placeholder="Título"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Fecha (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
      />
      <TextInput
        style={styles.input}
        placeholder="Lugar"
        value={location}
        onChangeText={setLocation}
      />
      <TextInput
        style={[styles.input, { height: 80 }]}
        placeholder="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
      />
      <Button title="Crear Evento" onPress={handleCreateEvent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f8f8f8',
  },
});
