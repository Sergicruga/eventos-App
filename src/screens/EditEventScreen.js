// screens/EditEventScreen.jsx
import React, { useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, Image, TouchableOpacity,
  Platform, Modal, ScrollView, KeyboardAvoidingView, ActivityIndicator
} from 'react-native';
import { EventContext } from '../EventContext';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { uploadEventImage } from '../api/upload';
import { Calendar } from 'react-native-calendars'; // Add this import at the top
import { API_URL } from '../api/config'; // <-- necesario para resolver rutas relativas

const COLORS = {
  primary: '#3B5BA9',
  secondary: '#6C757D',
  accent: '#F5CBA7',
  background: '#F8FAFC',
  white: '#fff',
  gray: '#888',
  inputBg: '#F1F5F9',
  border: '#D1D5DB',
  shadow: '#B0BEC5',
  text: '#444',
};

const EVENT_TYPES = [
  { label: 'Concierto', value: 'Concierto' },
  { label: 'Fiesta', value: 'Fiesta' },
  { label: 'Deportivo', value: 'Deportivo' },
  { label: 'Otro', value: 'Otro' },
];

// --- Helper para normalizar imagen a URL absoluta al renderizar ---
const toAbsoluteUrl = (uri) => {
  if (!uri) return null;
  if (typeof uri !== 'string') uri = String(uri);

  // Ya absoluta o file:// (local)
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('file://')) return uri;

  // Quitar slash final en API_URL y unir correctamente
  const base = API_URL?.replace(/\/+$/, '') || '';
  if (uri.startsWith('/')) return `${base}${uri}`;
  return `${base}/${uri}`;
};

export default function EditEventScreen({ route, navigation }) {
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

  // Fields
  const [title, setTitle] = useState(currentEvent?.title || '');
  const [date, setDate] = useState(initialDate ? new Date(initialDate) : new Date());
  const [showCal, setShowCal] = useState(false);

  const [locationName, setLocationName] = useState(currentEvent?.location || '');
  const [coords, setCoords] = useState({
    latitude: currentEvent?.latitude ?? null,
    longitude: currentEvent?.longitude ?? null,
  });
  const [hasLocPerm, setHasLocPerm] = useState(false);

  // --- Imagen: resolver a absoluta para que se vea al abrir ---
  const resolvedInitialImage = toAbsoluteUrl(currentEvent?.image || '');
  const initialResolvedRef = useRef(resolvedInitialImage);
  const [imageUri, setImageUri] = useState(resolvedInitialImage);

  // Modal map
  const [mapVisible, setMapVisible] = useState(false);
  const [mapRegion, setMapRegion] = useState({
    latitude: coords.latitude ?? 40.4168,
    longitude: coords.longitude ?? -3.7038,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const [loadingPerm, setLoadingPerm] = useState(true);
  const [saving, setSaving] = useState(false);

  // === Hora (HH:mm) ===
  const [timeModalVisible, setTimeModalVisible] = useState(false);
  const initialHHMM = useMemo(() => {
    const t1 = currentEvent?.timeStart ?? currentEvent?.time_start;
    if (typeof t1 === 'string' && /^\d{2}:\d{2}/.test(t1)) return t1.slice(0, 5);
    const iso = currentEvent?.startsAt ?? currentEvent?.starts_at ?? currentEvent?.event_at;
    if (typeof iso === 'string' && iso.length >= 16) return iso.slice(11, 16);
    return null;
  }, [currentEvent]);

  const now = new Date();
  const [hour, setHour] = useState(initialHHMM ? initialHHMM.split(':')[0] : String(now.getHours()).padStart(2, '0'));
  const [minute, setMinute] = useState(initialHHMM ? initialHHMM.split(':')[1] : String(now.getMinutes()).padStart(2, '0'));

  const pad = (v) => String(v ?? '').padStart(2, '0');
  const clampNum = (v, max) => {
    const n = parseInt(String(v).replace(/\D/g, ''), 10);
    if (isNaN(n)) return '00';
    return pad(Math.max(0, Math.min(max, n)));
  };
  const formattedTime = useMemo(() => `${pad(hour)}:${pad(minute)}`, [hour, minute]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setHasLocPerm(status === 'granted');
      if (status === 'granted' && coords.latitude && coords.longitude) {
        setMapRegion(r => ({
          ...r,
          latitude: coords.latitude,
          longitude: coords.longitude
        }));
      }
      setLoadingPerm(false);
    })();
    // eslint-disable-next-line
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
      setImageUri(result.assets[0].uri); // file://
    }
  }, []);

  // ---------- Date ----------
  const formattedDate = useCallback(() => {
    if (!(date instanceof Date)) return '';
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
  const [description, setDescription] = useState(currentEvent?.description || '');
  const [type, setType] = useState(currentEvent?.type || '');
  const [typeModalVisible, setTypeModalVisible] = useState(false);

  const handleSave = useCallback(async () => {
    if (!title.trim()) return Alert.alert('Falta título', 'Introduce un título para el evento.');
    if (!type) return Alert.alert('Falta tipo', 'Selecciona un tipo de evento.');
    if (!locationName) return Alert.alert('Falta ubicación', 'Selecciona la ubicación en el mapa.');

    setSaving(true);

    let baseCoords = coords;
    if (!coords.latitude || !coords.longitude) {
      try {
        const loc = await Location.getCurrentPositionAsync({});
        baseCoords = loc.coords;
      } catch (e) {
        Alert.alert('Error', 'No se pudo obtener la ubicación.');
        setSaving(false);
        return;
      }
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

    // --- Upload image si ha cambiado ---
    let imageUrl = currentEvent?.image || '';
    const initialResolved = initialResolvedRef.current || '';
    if (imageUri && imageUri.startsWith('file://')) {
      try {
        const oldImagePath = currentEvent?.image || '';
        imageUrl = await uploadEventImage(imageUri, oldImagePath); // pass old image path
      } catch (e) {
        Alert.alert('Error', 'No se pudo subir la imagen.');
        setSaving(false);
        return;
      }
    } else if (imageUri && imageUri !== initialResolved) {
      // Se seleccionó una imagen remota distinta (p.ej. pegaste una URL)
      imageUrl = imageUri;
    } // si no ha cambiado, mantenemos currentEvent.image tal cual (evita pasar absoluta si guardabas relativa)

    // Save event
    try {
      const hhmm = formattedTime; // HH:mm
      const startsAtIso = `${normalizeDate(date)}T${hhmm}:00`;

      await updateEvent({
        id: currentEvent.id,
        title,
        date: normalizeDate(date),
        timeStart: hhmm,          // NUEVO
        startsAt: startsAtIso,    // NUEVO
        location: resolvedAddress,
        description,
        type,
        image: imageUrl,
        latitude: baseCoords.latitude,
        longitude: baseCoords.longitude,
      });
      Alert.alert('Listo', 'Evento actualizado correctamente.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar el evento.');
    } finally {
      setSaving(false);
    }
  }, [
    title, type, coords, locationName, imageUri, date, description,
    updateEvent, navigation, currentEvent, formattedTime
  ]);

  if (loadingPerm || !currentEvent) {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={{ marginTop: 8, color: COLORS.primary }}>Cargando…</Text>
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
          <Text style={styles.title}>Editar Evento</Text>

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
            maxLength={60}
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

          {/* Hora */}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.label}>Hora</Text>
            <TouchableOpacity onPress={() => setTimeModalVisible(true)} style={styles.dateButton}>
              <Ionicons name="time-outline" size={20} color={COLORS.primary} style={{ marginRight: 8 }} />
              <Text style={styles.dateText}>{formattedTime}</Text>
            </TouchableOpacity>
            <Modal visible={timeModalVisible} transparent animationType="fade" onRequestClose={() => setTimeModalVisible(false)}>
              <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => setTimeModalVisible(false)}>
                <View style={styles.timeModal}>
                  <Text style={styles.timeModalTitle}>Seleccionar hora</Text>
                  <View style={styles.timeInputsRow}>
                    <TextInput
                      value={hour}
                      onChangeText={(v) => setHour(clampNum(v, 23))}
                      keyboardType="number-pad"
                      maxLength={2}
                      style={styles.timeInput}
                      placeholder="HH"
                      placeholderTextColor={COLORS.gray}
                    />
                    <Text style={styles.timeColon}>:</Text>
                    <TextInput
                      value={minute}
                      onChangeText={(v) => setMinute(clampNum(v, 59))}
                      keyboardType="number-pad"
                      maxLength={2}
                      style={styles.timeInput}
                      placeholder="MM"
                      placeholderTextColor={COLORS.gray}
                    />
                  </View>
                  <TouchableOpacity onPress={() => setTimeModalVisible(false)} style={[styles.primaryBtn, { marginTop: 8 }]}>
                    <Text style={styles.primaryBtnText}>Usar esta hora</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
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
                    color: COLORS.text,
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

          {/* Guardar */}
          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.85}
            style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
            disabled={saving}
            testID="guardar-evento-btn"
          >
            {saving ? (
              <ActivityIndicator color={COLORS.white} style={{ marginRight: 8 }} />
            ) : (
              <Ionicons name="save-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
            )}
            <Text style={styles.primaryBtnText}>{saving ? 'Guardando...' : 'Guardar cambios'}</Text>
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
    color: COLORS.text,
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
    color: COLORS.text,
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
    backgroundColor: COLORS.gray,
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
    color: COLORS.white,
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
    backgroundColor: 'rgba(44, 34, 84, 0.18)',
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
    color: COLORS.text,
    flex: 1,
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
    alignItems: 'center',
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
    color: COLORS.text,
    textAlign: 'center',
  },
  pickerOptionTextSelected: {
    fontWeight: 'bold',
    color: COLORS.secondary,
  },

  // === Hora ===
  timeModal: {
    backgroundColor: COLORS.white,
    width: '85%',
    alignSelf: 'center',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
    alignItems: 'center',
  },
  timeModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 6,
  },
  timeInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  timeInput: {
    width: 70,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: COLORS.inputBg,
    color: COLORS.text,
    fontSize: 18,
  },
  timeColon: {
    marginHorizontal: 10,
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.secondary,
  },
});
