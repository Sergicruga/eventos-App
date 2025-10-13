import React, { useState, useContext, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, Image, TouchableOpacity,
  Platform, Modal, ScrollView, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Calendar } from 'react-native-calendars';
import MapView, { Marker } from 'react-native-maps';
import { Picker } from '@react-native-picker/picker';
import { API_URL } from '../api/config';
// Optional: Uncomment if you have these installed
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#3B5BA9', // Soft blue
  secondary: '#6C757D', // Muted gray
  accent: '#F5CBA7', // Soft peach
  background: '#F8FAFC', // Very light gray/white
  white: '#fff',
  gray: '#888',         // Placeholder gray
  inputBg: '#F1F5F9',
  border: '#D1D5DB',
  shadow: '#B0BEC5',
  text: '#444',         // Main text color
};

const EVENT_TYPES = [
  { label: 'Concierto', value: 'Concierto' },
  { label: 'Fiesta', value: 'Fiesta' },
  { label: 'Deportivo', value: 'Deportivo' },
  { label: 'Otro', value: 'Otro' },
];

export default function CreateEventScreen({ navigation }) {
  const { addEvent } = useContext(EventContext);

  // Fields
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date());
  const [showCal, setShowCal] = useState(false);

  const [locationName, setLocationName] = useState('');
  const [coords, setCoords] = useState({ latitude: null, longitude: null });
  const [hasLocPerm, setHasLocPerm] = useState(false);
  const [imageUri, setImageUri] = useState(null);

  // Modal map
  const [mapVisible, setMapVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: 40.4168,
    longitude: -3.7038,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const [loadingPerm, setLoadingPerm] = useState(true);
  const [saving, setSaving] = useState(false); // Prevent double event creation

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
      setLoadingPerm(false);
    })();
  }, []);

  // ---------- Image ----------
  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitas permitir acceso a tus fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setImageUri(result.assets[0].uri);
    }
  }, []);

  // ---------- Date ----------
  const formattedDate = useCallback(() => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [date]);

  // ---------- Map / Location ----------
  const openMap = useCallback(async () => {
    if (!hasLocPerm) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso de ubicación', 'No podemos abrir el selector sin permisos.');
        return;
      }
      setHasLocPerm(true);
    }
    // Optionally clear previous location if you want to force new pick:
    // setLocationName('');
    setMapVisible(true);
  }, [hasLocPerm]);

  const handleLongPress = useCallback(async (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setCoords({ latitude, longitude });
    try {
      const res = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (res?.length) {
        setLocationName(formatAddress(res[0]));
      } else {
        setLocationName(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
      }
    } catch {
      setLocationName(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }
  }, []);

  const acceptMap = useCallback(() => {
    if (coords.latitude == null || coords.longitude == null) {
      Alert.alert('Ubicación', 'Mantén pulsado en el mapa para colocar el marcador.');
      return;
    }
    setMapVisible(false);
  }, [coords]);

  // ---------- Utils ----------
  const formatAddress = (a) => {
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

  // ---------- Save ----------
  const [description, setDescription] = useState('');
  const [type, setType] = useState('');
  const [typeModalVisible, setTypeModalVisible] = useState(false);
  const handleCreateEvent = useCallback(async () => {
    if (!title.trim()) return Alert.alert('Falta título', 'Introduce un título para el evento.');
    if (!type) return Alert.alert('Falta tipo', 'Selecciona un tipo de evento.');
    if (!locationName) return Alert.alert('Falta ubicación', 'Selecciona la ubicación en el mapa.');

    setSaving(true);

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permiso denegado', 'No podemos guardar el evento sin ubicación.');
      setSaving(false);
      return;
    }

    let baseCoords;
    try {
      baseCoords =
        coords?.latitude != null && coords?.longitude != null
          ? coords
          : (await Location.getCurrentPositionAsync({})).coords;
    } catch (e) {
      console.warn('Error obteniendo ubicación:', e);
      Alert.alert('Error', 'No se pudo obtener la ubicación.');
      setSaving(false);
      return;
    }

    let resolvedAddress = locationName?.trim();
    if (!resolvedAddress) {
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: baseCoords.latitude,
          longitude: baseCoords.longitude,
        });
        if (results && results.length > 0) {
          resolvedAddress = formatAddress(results[0]);
          setLocationName(resolvedAddress);
        }
      } catch {
        resolvedAddress = `${baseCoords.latitude.toFixed(5)}, ${baseCoords.longitude.toFixed(5)}`;
      }
    }

    // --- Use local image URI directly ---
    let imageUrl = imageUri || 'https://placehold.co/600x300?text=Evento';

    // Save event
    addEvent({
      title,
      date: normalizeDate(date),
      location:
        resolvedAddress ||
        `${baseCoords.latitude.toFixed(5)}, ${baseCoords.longitude.toFixed(5)}`,
      description,
      type,
      image: imageUrl,
      latitude: baseCoords.latitude,
      longitude: baseCoords.longitude,
    });

    setSaving(false);
    Alert.alert('Evento creado', '¡Tu evento se ha guardado!');
    navigation.goBack();
  }, [title, type, coords, locationName, imageUri, date, description, addEvent, navigation]);

  if (loadingPerm) {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={{ marginTop: 8, color: COLORS.primary }}>Cargando permisos…</Text>
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#f8fafc', '#e0e7ef', '#f5e8e4']}
      style={{ flex: 1 }}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.title}>Crear Evento</Text>

          {/* Imagen */}
          <TouchableOpacity onPress={pickImage} activeOpacity={0.8} accessibilityLabel="Seleccionar foto del evento">
            <View style={styles.imagePicker}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.image} />
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Ionicons name="image-outline" size={48} color={COLORS.primary} />
                  <Text style={{ color: COLORS.gray, marginTop: 6 }}>Seleccionar foto del evento</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>

          {/* Título */}
          <TextInput
            style={[styles.input, { color: COLORS.text }]}
            placeholder="Título"
            value={title}
            onChangeText={setTitle}
            placeholderTextColor={COLORS.gray}
            selectionColor={COLORS.primary}
            maxLength={60
            }
            autoCapitalize="sentences"
          />

          {/* Fecha */}
          <View style={{ marginBottom: 12, zIndex: 1 }}>
            <Text style={styles.label}>Fecha</Text>
            <TouchableOpacity onPress={() => setShowCal(true)} style={styles.dateButton}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
              <Text style={styles.dateText}>{formattedDate()}</Text>
            </TouchableOpacity>
            <Modal visible={showCal} animationType="slide" transparent>
              <View style={styles.modalOverlay}>
                <View style={styles.calendarModal}>
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
                      return { [k]: { selected: true, selectedColor: COLORS.secondary } };
                    })()}
                    theme={{
                      backgroundColor: COLORS.white,
                      calendarBackground: COLORS.white,
                      textSectionTitleColor: COLORS.gray,
                      selectedDayBackgroundColor: COLORS.secondary,
                      selectedDayTextColor: COLORS.white,
                      todayTextColor: COLORS.secondary,
                      dayTextColor: COLORS.gray,
                      arrowColor: COLORS.gray,
                      monthTextColor: COLORS.gray,
                    }}
                  />
                  <TouchableOpacity onPress={() => setShowCal(false)} style={styles.secondaryBtn}>
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
                style={[
                  styles.input,
                  {
                    flex: 1,
                    marginBottom: 0,
                    backgroundColor: COLORS.inputBg,
                    color: COLORS.text, // Use main text color
                    opacity: 0.8,
                  },
                ]}
                placeholder="Nombre del lugar"
                value={locationName}
                placeholderTextColor={COLORS.gray}
                selectionColor={COLORS.primary}
                editable={false}
                selectTextOnFocus={false}
              />
              <TouchableOpacity onPress={openMap} style={styles.smallBtn} accessibilityLabel="Seleccionar ubicación en el mapa">
                <Ionicons name="map-outline" size={20} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            {coords.latitude != null && coords.longitude != null ? (
              <Text style={{ marginTop: 6, color: COLORS.secondary }}>
                Lat: {coords.latitude.toFixed(5)} | Lon: {coords.longitude.toFixed(5)}
              </Text>
            ) : null}
          </View>

          {/* Tipo (Custom Picker) */}
          <Text style={styles.label}>Tipo</Text>
          <TouchableOpacity
            style={styles.customPickerBox}
            onPress={() => setTypeModalVisible(true)}
            activeOpacity={0.85}
            accessibilityLabel="Seleccionar tipo de evento"
          >
            <Text style={[
              styles.customPickerText,
              !type && { color: COLORS.gray }
            ]}>
              {type ? EVENT_TYPES.find(t => t.value === type)?.label : 'Selecciona un tipo'}
            </Text>
            <Ionicons name="chevron-down" size={22} color={COLORS.gray} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
          <Modal
            visible={typeModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setTypeModalVisible(false)}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPressOut={() => setTypeModalVisible(false)}
            >
              <View style={styles.pickerModal}>
                {EVENT_TYPES.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.pickerOption,
                      type === opt.value && styles.pickerOptionSelected
                    ]}
                    onPress={() => {
                      setType(opt.value);
                      setTypeModalVisible(false);
                    }}
                  >
                    <Text style={[
                      styles.pickerOptionText,
                      type === opt.value && styles.pickerOptionTextSelected
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>

          {/* Descripción */}
          <TextInput
            style={[styles.input, { minHeight: 60, color: COLORS.text }]}
            placeholder="Descripción"
            value={description}
            onChangeText={setDescription}
            placeholderTextColor={COLORS.gray}
            multiline
            selectionColor={COLORS.primary}
            maxLength={300}
          />

          {/* Crear */}
          <TouchableOpacity
            onPress={handleCreateEvent}
            activeOpacity={0.85}
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            testID="crear-evento-btn"
          >
            {saving ? (
              <ActivityIndicator color={COLORS.white} style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="heart" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.primaryBtnText}>{saving ? 'Guardando...' : 'Crear'}</Text>
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
                  pinColor={COLORS.primary}
                />
              )}
            </MapView>
            <View style={styles.mapModalFooter}>
              <Text style={{ fontWeight: '600', color: COLORS.primary }}>
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
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 18,
    textAlign: 'center',
    color: COLORS.primary,
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-DemiBold' : 'sans-serif-medium',
    textShadowColor: COLORS.shadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text, // Use main text color
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  label: {
    fontWeight: '600',
    marginBottom: 6,
    color: COLORS.secondary,
    fontSize: 16,
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: COLORS.inputBg,
    overflow: 'hidden',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  pickerFakeBox: {
    height: 55,
    justifyContent: 'center',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.inputBg,
  },
  picker: {
    height: 55,
    color: COLORS.primary,
    fontSize: 16,
    width: '100%',
    ...Platform.select({
      ios: {
        // Make iOS picker look more like a dropdown
        marginTop: -4,
        marginBottom: -4,
        backgroundColor: COLORS.inputBg,
      },
      android: {
        backgroundColor: COLORS.inputBg,
      },
    }),
  },
  imagePicker: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 160,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.inputBg,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 160,
    borderRadius: 16,
    resizeMode: 'cover',
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    padding: 12,
    marginTop: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  dateText: {
    fontSize: 16,
    color: COLORS.text, // Use main text color for date
    fontWeight: '500',
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 18,
    letterSpacing: 1,
  },
  secondaryBtn: {
    backgroundColor: COLORS.gray, // Changed from COLORS.accent to COLORS.gray
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  secondaryBtnText: {
    color: COLORS.white, // White text for contrast on gray
    fontWeight: '600',
    fontSize: 16,
  },
  smallBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(44, 34, 84, 0.18)', // Slightly lighter for less distraction
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModal: {
    margin: 16,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    padding: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
  },
  mapModalFooter: {
    padding: 16,
    backgroundColor: COLORS.white,
    gap: 8,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  customPickerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
    justifyContent: 'space-between',
  },
  customPickerText: {
    fontSize: 16,
    color: COLORS.text, // Use main text color for filled picker
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(44, 34, 84, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerModal: {
    backgroundColor: COLORS.white,
    width: '85%',
    alignSelf: 'center',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 8,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
    alignItems: 'center', // Center options horizontally
  },
  pickerOption: {
    width: '90%',
    alignSelf: 'center',
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 12,
    marginVertical: 4,
    alignItems: 'center',
  },
  pickerOptionSelected: {
    backgroundColor: COLORS.inputBg,
  },
  pickerOptionText: {
    fontSize: 18,
    color: COLORS.text, // Use main text color for picker options
    textAlign: 'center',
  },
  pickerOptionTextSelected: {
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
});
