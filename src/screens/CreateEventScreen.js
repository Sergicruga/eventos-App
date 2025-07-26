import React, { useState, useContext } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, Image, TouchableOpacity } from 'react-native';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Picker } from '@react-native-picker/picker';

export default function CreateEventScreen({ navigation }) {
  const { addEvent } = useContext(EventContext);
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark'
    ? {
        background: '#18181A',
        text: '#fff',
        input: '#232327',
        border: '#444'
      }
    : {
        background: '#fff',
        text: '#18181A',
        input: '#f8f8f8',
        border: '#ccc'
      };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets[0]?.uri) {
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
        placeholderTextColor={colorScheme === 'dark' ? '#aaa' : '#888'}
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="Fecha"
        placeholderTextColor={colorScheme === 'dark' ? '#aaa' : '#888'}
        value={date}
        onChangeText={setDate}
      />
      <TextInput
        style={styles.input}
        placeholder="Lugar"
        placeholderTextColor={colorScheme === 'dark' ? '#aaa' : '#888'}
        value={locationName}
        onChangeText={setLocationName}
      />
      <View style={styles.pickerWrapper}>
        <Picker
          selectedValue={type}
          onValueChange={setType}
          style={styles.picker}
        >
          <Picker.Item label="Selecciona tipo de evento" value="" />
          <Picker.Item label="Concierto" value="Concierto" />
          <Picker.Item label="Fiesta" value="Fiesta" />
          <Picker.Item label="Deportivo" value="Deportivo" />
          <Picker.Item label="Otro" value="Otro" />
        </Picker>
      </View>
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
