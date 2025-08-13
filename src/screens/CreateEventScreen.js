import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Image, TouchableOpacity } from 'react-native';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';
import { safePickImage } from '../utils/safePickImage';

export default function CreateEventScreen({ navigation }) {
  const { addEvent } = useContext(EventContext);
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState(null);

  const pickImage = async () => {
  const uri = await safePickImage();
  if (uri) setImageUri(uri); {
    Alert.alert('Permiso requerido', 'Necesitas permitir acceso a tus fotos.');
    return;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: [ImagePicker.MediaType.Image], // 👈 evita el warning
    allowsEditing: true,
    quality: 0.7,
  });
  if (!result.canceled && result.assets?.[0]?.uri) {
    setImageUri(result.assets[0].uri);
  }
};


  const handleCreateEvent = async () => {
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
      type,
      imageUrl: imageUri || 'https://placehold.co/600x300?text=Evento',
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });

    Alert.alert('Evento creado', '¡Tu evento se ha guardado!');
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Evento</Text>
      <TouchableOpacity onPress={pickImage}>
        <View style={styles.imagePicker}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <Text style={{ color: '#888' }}>Seleccionar foto del evento</Text>
          )}
        </View>
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        placeholder="Título"
        value={title}
        onChangeText={setTitle}
        placeholderTextColor={"#F20C0C"}
      />
      <TextInput
        style={styles.input}
        placeholder="Fecha"
        value={date}
        onChangeText={setDate}
        placeholderTextColor={"#F20C0C"}
      />
      <TextInput
        style={styles.input}
        placeholder="Lugar"
        value={locationName}
        onChangeText={setLocationName}
        placeholderTextColor={"#F20C0C"}
      />
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={type}
          onValueChange={setType}
          style={styles.picker}
          
        >
          <Picker.Item label="Selecciona tipo de evento" value="" color="#F20C0C" />
          <Picker.Item label="Concierto" value="Concierto" color="#F20C0C" />
          <Picker.Item label="Fiesta" value="Fiesta" color="#F20C0C"/>
          <Picker.Item label="Deportivo" value="Deportivo" color="#F20C0C"/>
          <Picker.Item label="Otro" value="Otro" color="#F20C0C"/>
        </Picker>
      </View>
      <TextInput
        style={styles.input}
        placeholder="Descripción"
        value={description}
        onChangeText={setDescription}
        placeholderTextColor={"#F20C0C"}
      />
      <Button title="Crear" onPress={handleCreateEvent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center', },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 10, marginBottom: 16, fontSize: 16, backgroundColor: '#f8f8f8'
  },
  pickerWrapper: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    marginBottom: 16, backgroundColor: '#f8f8f8'
  },
  imagePicker: {
    alignItems: 'center', justifyContent: 'center', height: 160, marginBottom: 20,
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#f4f4f4',
  },
  image: {
    width: '100%', height: 160, borderRadius: 8,
  }
});
