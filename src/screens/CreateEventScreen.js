import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';

export default function CreateEventScreen({ navigation }) {
  const { addEvent } = useContext(EventContext);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');

  const handleCreateEvent = async () => {
    // Pide la ubicación actual
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'No podemos guardar el evento sin ubicación.');
      return;
    }
    let loc = await Location.getCurrentPositionAsync({});

    addEvent({
      title,
      date,
      location: locationName,
      description,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });

    Alert.alert('Evento creado', '¡Tu evento se ha guardado!');
    navigation.goBack();
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
        placeholder="Fecha"
        value={date}
        onChangeText={setDate}
      />
      <TextInput
        style={styles.input}
        placeholder="Lugar"
        value={locationName}
        onChangeText={setLocationName}
      />
      <TextInput
        style={styles.input}
        placeholder="Descripción"
        value={description}
        onChangeText={setDescription}
      />
      <Button title="Crear" onPress={handleCreateEvent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 10, marginBottom: 16, fontSize: 16, backgroundColor: '#f8f8f8'
  },
});
