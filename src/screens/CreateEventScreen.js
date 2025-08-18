import React, { useState, useContext, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, Image, TouchableOpacity,
  Platform, Modal, ScrollView, KeyboardAvoidingView
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
  const [date, setDate] = useState(new Date());
  const [showCal, setShowCal] = useState(false);

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
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitas permitir acceso a tus fotos.');
      return;
    }
    const options =
      ImagePicker.MediaType
        ? { mediaTypes: [ImagePicker.MediaType.Image], allowsEditing: true, quality: 0.7 }
        : { mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.7 };

    const result = await ImagePicker.launchImageLibraryAsync(options);

    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  };

  // ---------- Fecha ----------
  const formattedDate = () => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    // Mostramos DD-MM-YYYY pero al guardar usas este mismo formato
    return `${y}-${m}-${d}`;
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
      if (res?.length) {
        setLocationName(formatAddress(res[0])); // 👈 aquí el cambio clave
      } else {
        setLocationName(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      }
      } catch {
        setLocationName(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      }
    };

  const acceptMap = () => {
    if (coords.latitude == null || coords.longitude == null) {
      Alert.alert('Ubicación', 'Mantén pulsado en el mapa para colocar el marcador.');
      return;
    }
    setMapVisible(false);
  };

  // ---------- Guardar ----------
  const formatAddress = (a) => {
  // a: { name, street, streetNumber, city, subregion, region, postalCode, country, ... }
  const line1Parts = [];

  if (a.street) line1Parts.push(a.street);
  if (a.streetNumber) line1Parts.push(String(a.streetNumber));
  if (!a.street && a.name) line1Parts.push(String(a.name));

  const line1 = line1Parts.join(' ').trim();

  const city = a.city || a.subregion;
  const line2Parts = [city, a.region].filter(Boolean);

  const parts = [line1, ...line2Parts, a.postalCode, a.country].filter(Boolean);
  const seen = new Set();
  const dedup = parts.filter(p => {
    const key = p.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return dedup.join(', ').trim() || [a.name, a.country].filter(Boolean).join(', ');
};
  const normalizeDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
  const looksLikeOnlyNumber = (s) => /^\d+$/.test((s || '').trim());
  const [description, setDescription] = useState('');
  const handleCreateEvent = async () => {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permiso denegado', 'No podemos guardar el evento sin ubicación.');
    return;
  }

  try {
    let baseCoords = coords?.latitude != null ? coords : (await Location.getCurrentPositionAsync({})).coords;

    let resolvedAddress = locationName?.trim();
    if (!resolvedAddress) {
      const results = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      if (results && results.length > 0) {
        resolvedAddress = formatAddress(results[0]);
        // 👇 opcional: autocompleta el input
        setLocationName(resolvedAddress);
      }
    }

    addEvent({
      title,
      date: normalizate(date),// 👈 asegúrate de pasarlo como string si usas Date
      location: resolvedAddress || `${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`,
      description,
      type,
      image: imageUri || 'https://placehold.co/600x300?text=Evento',
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
    });

    Alert.alert('Evento creado', '¡Tu evento se ha guardado!');
    navigation.goBack();
  } catch (e) {
    console.warn(e);
    Alert.alert('Error', 'No se pudo obtener la ubicación.');
  }
};


  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"   // <- para que los toques no se pierdan
      >
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
          placeholderTextColor="#333"
        />

        {/* Fecha */}
        <View style={{ marginBottom: 12, zIndex: 1 }}>
          <Text style={styles.label}>Fecha</Text>
          <TouchableOpacity onPress={() => setShowCal(true)} style={[styles.dateButton, { padding: 12 }]}>
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
                    const k = date.toISOString().slice(0, 10);
                    return { [k]: { selected: true } };
                  })()}
                />
                <TouchableOpacity onPress={() => setShowCal(false)} style={[styles.secondaryBtn, { margin: 12 }]}>
                  <Text style={styles.secondaryBtnText}>Cerrar</Text>
                </TouchableOpacity>
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
              placeholder="Nombre del lugar "
              value={locationName}
              onChangeText={setLocationName}
              placeholderTextColor="#333"
            />
            <TouchableOpacity onPress={openMap} style={styles.smallBtn}>
              <Text style={styles.smallBtnText}>MAPA</Text>
            </TouchableOpacity>
          </View>
          {coords.latitude != null && coords.longitude != null ? (
            <Text style={{ marginTop: 6 }}>
              Lat: {coords.latitude.toFixed(5)} | Lon: {coords.longitude.toFixed(5)}
            </Text>
          ) : null}
        </View>

        {/* Tipo */}
        
        <View style={[styles.pickerWrapper, { zIndex: 1 }]}>
          <Picker selectedValue={type} onValueChange={setType} style={[styles.picker, { color: '#000' }]}> 
            <Picker.Item label="Selecciona un tipo" value="" color="#fff" />
            <Picker.Item label="Concierto" value="Concierto" color="#fff" />
            <Picker.Item label="Fiesta" value="Fiesta" color="#fff" />
            <Picker.Item label="Deportivo" value="Deportivo" color="#fff" />
            <Picker.Item label="Otro" value="Otro" color="#fff" />
          </Picker>
        </View>

        {/* Descripción */}
        <TextInput
          style={styles.input}
          placeholder="Descripción"
          value={description}
          onChangeText={setDescription}
          placeholderTextColor="#333"
          multiline
        />

        {/* Botón Crear (custom, con zIndex/elevation) */}
        <TouchableOpacity
          onPress={() => { handleCreateEvent(); }}
          activeOpacity={0.85}
          style={styles.primaryBtn}
        >
          <Text style={styles.primaryBtnText}>Crear</Text>
        </TouchableOpacity>
      </ScrollView>

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
            <TouchableOpacity onPress={acceptMap} style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Usar ubicación</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMapVisible(false)} style={[styles.secondaryBtn, { marginTop: 8 }]}>
              <Text style={styles.secondaryBtnText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },

  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 10, marginBottom: 12, fontSize: 16, backgroundColor: '#f8f8f8'
  },

  label: { fontWeight: '600', marginBottom: 6 },

  pickerWrapper: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    marginBottom: 12, backgroundColor: '#f8f8f8',
  },
  picker: { height: 55 },

  imagePicker: {
    alignItems: 'center', justifyContent: 'center', height: 160, marginBottom: 12,
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8, backgroundColor: '#f4f4f4',
  },
  image: { width: '100%', height: 160, borderRadius: 8 },

  dateButton: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    backgroundColor: '#f8f8f8'
  },
  dateText: { fontSize: 16 },

  primaryBtn: {
    marginTop: 12,
    backgroundColor: '#1976d2',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    zIndex: 10,        // por encima del Picker en Android
    elevation: 2,
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  secondaryBtn: {
    backgroundColor: '#e0e0e0',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#333', fontWeight: '600' },

  smallBtn: {
    backgroundColor: '#1976d2',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  smallBtnText: { color: '#fff', fontWeight: '600' },
});
