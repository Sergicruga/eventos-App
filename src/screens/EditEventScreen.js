import React, { useContext, useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Image, TouchableOpacity } from 'react-native';
import { EventContext } from '../screens/EventContext';
import * as ImagePicker from 'expo-image-picker';
import { safePickImage } from '../utils/safePickImage';

export default function EditEventScreen({ route, navigation }) {
  // Puedes recibir el evento completo o solo el id
  const passedEvent = route.params?.event || null;
  const eventId = route.params?.eventId || passedEvent?.id;

  const { events, updateEvent } = useContext(EventContext);

  const currentEvent = useMemo(
    () => passedEvent || events.find(e => e.id === eventId),
    [passedEvent, events, eventId]
  );

  useEffect(() => {
    if (!currentEvent) {
      Alert.alert('Error', 'No se encontró el evento.');
      navigation.goBack();
    }
  }, [currentEvent, navigation]);

  const [type, setType] = useState(currentEvent?.type || '');
  const [title, setTitle] = useState(currentEvent?.title || '');
  const [date, setDate] = useState(currentEvent?.date || '');
  const [locationName, setLocationName] = useState(currentEvent?.location || '');
  const [description, setDescription] = useState(currentEvent?.description || '');
  const [imageUri, setImageUri] = useState(
    (currentEvent?.images && currentEvent.images[0]?.url) ||
    currentEvent?.image ||
    currentEvent?.imageUrl ||
    null
  );

  const pickImage = async () => {
    const uri = await safePickImage();
    if (uri) setImageUri(uri); {
      Alert.alert('Permiso requerido', 'Necesitas permitir acceso a tus fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: [ImagePicker.MediaType.Image],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (!currentEvent) return;
    if (!title?.trim()) {
      Alert.alert('Falta título', 'Añade un título al evento.');
      return;
    }
    if (!date?.trim()) {
      Alert.alert('Falta fecha', 'Añade una fecha (YYYY-MM-DD).');
      return;
    }

    // Validación rápida en cliente (ya validas también en el Context)
    const today = new Date();
    const eventDate = new Date(date);
    if (eventDate < new Date(today.setHours(0,0,0,0))) {
      Alert.alert('Fecha inválida', 'No puedes poner una fecha anterior a hoy.');
      return;
    }

    updateEvent({
      ...currentEvent,
      type,
      title: title.trim(),
      date: date.trim(),
      location: locationName.trim(),
      description: description.trim(),
      image: imageUri ?? null, 
      // mantenemos lat/lon tal cual salvo que quieras cambiarlos aquí
    });

    Alert.alert('Guardado', 'Evento actualizado correctamente.');
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Editar evento</Text>

      <TouchableOpacity onPress={pickImage}>
        <View style={styles.imagePicker}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <Text style={{ color: '#888' }}>Seleccionar/editar foto del evento</Text>
          )}
        </View>
      </TouchableOpacity>

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
        value={locationName}
        onChangeText={setLocationName}
      />
      <TextInput
        style={styles.input}
        placeholder="Tipo (Concierto, Fiesta, ...)"
        value={type}
        onChangeText={setType}
      />
      <TextInput
        style={styles.input}
        placeholder="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Button title="Guardar cambios" onPress={handleSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 10, marginBottom: 16, fontSize: 16, backgroundColor: '#f8f8f8'
  },
  imagePicker: {
    alignItems: 'center', justifyContent: 'center', height: 160, marginBottom: 20,
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#f4f4f4',
  },
  image: { width: '100%', height: 160, borderRadius: 8 },
});
