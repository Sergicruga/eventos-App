// screens/EditEventScreen.jsx
import React, { useContext, useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { EventContext } from '../EventContext';
import { safePickImage } from '../utils/safePickImage';
import { uploadEventPhoto } from '../api/events';

export default function EditEventScreen({ route, navigation }) {
  // Puedes recibir el evento completo o solo el id
  const passedEvent = route.params?.event || null;
  const routeEventId = route.params?.eventId || passedEvent?.id;

  const { events, updateEvent } = useContext(EventContext);

  const currentEvent = useMemo(
    () => passedEvent || events.find(e => String(e.id) === String(routeEventId)),
    [passedEvent, events, routeEventId]
  );

  useEffect(() => {
    if (!currentEvent) {
      Alert.alert('Error', 'No se encontró el evento.');
      navigation.goBack();
    }
  }, [currentEvent, navigation]);

  // Prefiere event_at (backend) y cae a date si viene del front
  const initialDate = (currentEvent?.event_at || currentEvent?.date || '').toString();

  const [type, setType] = useState(currentEvent?.type || 'local');
  const [title, setTitle] = useState(currentEvent?.title || '');
  const [date, setDate] = useState(initialDate);
  const [locationName, setLocationName] = useState(currentEvent?.location || '');
  const [description, setDescription] = useState(currentEvent?.description || '');
  const [imageUri, setImageUri] = useState(
    (currentEvent?.images && currentEvent.images[0]?.url) ||
    currentEvent?.image ||
    currentEvent?.imageUrl ||
    null
  );
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const uri = await safePickImage();
    if (!uri) return; // cancelado
    setImageUri(uri);
  };

  const validate = () => {
    if (!title?.trim()) {
      Alert.alert('Falta título', 'Añade un título al evento.');
      return false;
    }
    if (!date?.trim()) {
      Alert.alert('Falta fecha', 'Añade una fecha (YYYY-MM-DD).');
      return false;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      Alert.alert('Fecha inválida', 'Usa formato YYYY-MM-DD.');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!currentEvent) return;
    if (!validate()) return;

    setSaving(true);

    // Construimos el payload que espera EventContext.updateEvent
    const basePayload = {
      id: currentEvent.id,
      title: title.trim(),
      description: description.trim(),
      date: date.trim(), // EventContext lo mapea a event_at
      location: locationName.trim(),
      type: type || 'local',
      // Si la imagen es http(s), se envía; si es file://, la subimos aparte
      image: (typeof imageUri === 'string' && imageUri.startsWith('http')) ? imageUri : undefined,
    };

    try {
      // 1) Actualiza datos básicos (usa lógica robusta del contexto con timeout y 204-safe)
      const updated = await updateEvent(basePayload);
      if (!updated) throw new Error('No se pudo actualizar los datos del evento');

      // 2) Si la imagen es local (file://), súbela y vuelve a sincronizar
      if (imageUri && typeof imageUri === 'string' && imageUri.startsWith('file://')) {
        try {
          const uploadRes = await uploadEventPhoto(Number(currentEvent.id), imageUri);
          // El backend puede devolver { event } o { image }
          if (uploadRes?.event) {
            await updateEvent({ id: currentEvent.id, ...uploadRes.event });
          } else if (uploadRes?.image) {
            await updateEvent({ id: currentEvent.id, image: uploadRes.image });
          }
        } catch (e) {
          console.warn('Subida de imagen falló:', e?.message || e);
        }
      }

      Alert.alert('Listo', 'Evento actualizado correctamente.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar el evento.');
    } finally {
      setSaving(false); // evita quedarse pensando
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Editar evento</Text>

      <TouchableOpacity onPress={pickImage} disabled={saving}>
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
        editable={!saving}
      />
      <TextInput
        style={styles.input}
        placeholder="Fecha (YYYY-MM-DD)"
        value={date}
        onChangeText={setDate}
        editable={!saving}
      />
      <TextInput
        style={styles.input}
        placeholder="Lugar"
        value={locationName}
        onChangeText={setLocationName}
        editable={!saving}
      />
      <TextInput
        style={styles.input}
        placeholder="Tipo (Concierto, Fiesta, ...)"
        value={type}
        onChangeText={setType}
        editable={!saving}
      />
      <TextInput
        style={[styles.input, { height: 100 }]}
        placeholder="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
        editable={!saving}
      />

      {saving ? (
        <View style={{ marginTop: 8 }}>
          <ActivityIndicator />
        </View>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Button title="Guardar cambios" onPress={handleSave} disabled={saving} />
      </View>
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
    overflow: 'hidden'
  },
  image: { width: '100%', height: 160, borderRadius: 8 },
});
