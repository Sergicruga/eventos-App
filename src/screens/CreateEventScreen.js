import React, { useState, useContext, useEffect } from 'react';
import {
  View, Text, TextInput, Button, StyleSheet, Alert, Image, TouchableOpacity,
  Platform, Modal
} from 'react-native';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Calendar } from 'react-native-calendars';
import MapView, { Marker } from 'react-native-maps';
import { Picker } from '@react-native-picker/picker';

export default function CreateEventScreen({ navigation }) {
  const { addEvent } = useContext(EventContext);

  // Campos
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date()); // usar Date real
  const [showCal, setShowCal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  

  const [locationName, setLocationName] = useState('');
  const [coords, setCoords] = useState({ latitude: null, longitude: null });
  const [hasLocPerm, setHasLocPerm] = useState(false);

  const [imageUri, setImageUri] = useState(null);

  // Modal mapa
  const [mapVisible, setMapVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: 40.4168, // Madrid por defecto
    longitude: -3.7038,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasLocPerm(status === 'granted');
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setMapRegion(r => ({
          ...r,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        }));
      }
    })();
  }, []);

  // ---------- Imagen ----------
  const pickImage = async () => {
  // Pide permisos
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitas permitir acceso a tus fotos.');
      return;
    }

    // Abre galería (API actual)
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, // ✅ en Expo managed funciona este
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  };


  // ---------- Fecha ----------
 
  const formattedDate = () => {
    // YYYY-MM-DD (o lo que prefieras guardar/mostrar)
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${d}-${m}-${y}`;
  };

  // ---------- Mapa / ubicación ----------
  const openMap = async () => {
    if (!hasLocPerm) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso de ubicación', 'No podemos abrir el selector sin permisos.');
        return;
      }
      setHasLocPerm(true);
    }
    setMapVisible(true);
  };

  const handleLongPress = async (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ latitude, longitude });
    try {
      const res = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (res && res[0]) {
        const r = res[0];
        const name =
          r.name ||
          `${r.street || ''} ${r.postalCode || ''}`.trim() ||
          r.city ||
          r.region ||
          'Ubicación seleccionada';
        setLocationName(name);
      }
    } catch {
      // silencioso
    }
  };

  const acceptMap = () => {
    if (!coords.latitude || !coords.longitude) {
      Alert.alert('Ubicación', 'Mantén pulsado en el mapa para colocar el marcador.');
      return;
    }
    setMapVisible(false);
  };

  // ---------- Guardar ----------
  const handleCreateEvent = async () => {
    // Validaciones mínimas
    if (!title.trim()) {
      Alert.alert('Falta título', 'Pon un título al evento.');
      return;
    }
    if (!locationName.trim() || coords.latitude == null || coords.longitude == null) {
      Alert.alert('Falta ubicación', 'Elige una ubicación en el mapa.');
      return;
    }

    const todayMid = new Date(); todayMid.setHours(0,0,0,0);
    const selectedMid = new Date(date); selectedMid.setHours(0,0,0,0);
    if (selectedMid.getTime() < todayMid.getTime()) {
      Alert.alert('Fecha inválida', 'No puedes crear un evento con fecha pasada.');
      return;
    }

    addEvent({
      title: title.trim(),
      date: formattedDate(),
      location: locationName.trim(),
      description: description.trim(),
      type,
      image: imageUri || 'https://placehold.co/600x300?text=Evento',
      latitude: coords.latitude,
      longitude: coords.longitude,
    });

    Alert.alert('Evento creado', '¡Tu evento se ha guardado!');
    navigation.goBack();
  };

  // Descripción (estado separado para mantener tu estructura)
  const [description, setDescription] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear Evento</Text>

      {/* Imagen */}
      <TouchableOpacity onPress={pickImage}>
        <View style={styles.imagePicker}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.image} />
          ) : (
            <Text style={{ color: '#888' }}>Seleccionar foto del evento</Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Título */}
      <TextInput
        style={styles.input}
        placeholder="Título"
        value={title}
        onChangeText={setTitle}
        placeholderTextColor="#F20C0C"
      />

      {/* Fecha */}
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.label}>Fecha</Text>
        <TouchableOpacity
          onPress={() => setShowCal(true)}
          style={styles.dateButton}
        >
          <Text style={styles.dateText}>{formattedDate()}</Text>
        </TouchableOpacity>
        <Modal visible={showCal} animationType="slide" transparent>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.3)', justifyContent:'center' }}>
            <View style={{ margin:16, borderRadius:12, backgroundColor:'#fff', overflow:'hidden' }}>
              <Calendar
                minDate={new Date().toISOString().slice(0,10)}
                onDayPress={(day) => {
                  const [y, m, d] = day.dateString.split('-').map(Number);
                  setDate(new Date(y, m - 1, d));
                  setShowCal(false);
                }}
                markedDates={(() => {
                  const ok = date instanceof Date && !isNaN(date.getTime());
                  if (!ok) return {};
                  const k = date.toISOString().slice(0, 10); // "YYYY-MM-DD"
                  return { [k]: { selected: true } };
                })()}
              />

              <Button title="Cerrar" onPress={() => setShowCal(false)} />
            </View>
          </View>
        </Modal>
      </View>

      {/* Ubicación */}
      <View style={{ marginBottom: 12 }}>
        <Text style={styles.label}>Ubicación</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            placeholder="Nombre del lugar (se autocompleta desde el mapa)"
            value={locationName}
            onChangeText={setLocationName}
            placeholderTextColor="#F20C0C"
          />
          <Button title="Mapa" onPress={openMap} />
        </View>
        {coords.latitude != null && coords.longitude != null ? (
          <Text style={{ marginTop: 6 }}>
            Lat: {coords.latitude.toFixed(5)} | Lon: {coords.longitude.toFixed(5)}
          </Text>
        ) : null}
      </View>

      {/* Tipo */}
      <View style={styles.pickerWrapper}>
        <Picker selectedValue={type} onValueChange={setType} style={styles.picker}>
          <Picker.Item label="Selecciona tipo de evento" value="" color="#F20C0C" />
          <Picker.Item label="Concierto" value="Concierto" color="#F20C0C" />
          <Picker.Item label="Fiesta" value="Fiesta" color="#F20C0C" />
          <Picker.Item label="Deportivo" value="Deportivo" color="#F20C0C" />
          <Picker.Item label="Otro" value="Otro" color="#F20C0C" />
        </Picker>
      </View>

      {/* Descripción */}
      <TextInput
        style={styles.input}
        placeholder="Descripción"
        value={description}
        onChangeText={setDescription}
        placeholderTextColor="#F20C0C"
        multiline
      />

      <Button title="Crear" onPress={handleCreateEvent} />

      {/* Modal Mapa */}
      <Modal visible={mapVisible} animationType="slide">
        <View style={{ flex: 1 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={mapRegion}
            onRegionChangeComplete={setMapRegion}
            onLongPress={handleLongPress}
          >
            {coords.latitude != null && coords.longitude != null && (
              <Marker
                coordinate={{ latitude: coords.latitude, longitude: coords.longitude }}
                draggable
                onDragEnd={handleLongPress}
                title="Lugar del evento"
                description={locationName || 'Mantén pulsado para mover'}
              />
            )}
          </MapView>
          <View style={{ padding: 12, backgroundColor: '#fff', gap: 8 }}>
            <Text style={{ fontWeight: '600' }}>
              Mantén pulsado para colocar el marcador. Luego pulsa “Usar ubicación”.
            </Text>
            <Button title="Usar ubicación" onPress={acceptMap} />
            <View style={{ height: 8 }} />
            <Button title="Cancelar" color="#d32f2f" onPress={() => setMapVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },

  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 10, marginBottom: 12, fontSize: 16, backgroundColor: '#f8f8f8'
  },

  label: { fontWeight: '600', marginBottom: 6 },

  pickerWrapper: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    marginBottom: 12, backgroundColor: '#f8f8f8'
  },
  picker: { height: 44 },

  imagePicker: {
    alignItems: 'center', justifyContent: 'center', height: 160, marginBottom: 12,
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#f4f4f4',
  },
  image: { width: '100%', height: 160, borderRadius: 8 },

  dateButton: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 12, backgroundColor: '#f8f8f8'
  },
  dateText: { fontSize: 16 }
});
