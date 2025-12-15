
import React, { useState, useEffect } from "react";
import { View, Text, Switch, TouchableOpacity, StyleSheet, Alert, Platform } from "react-native";
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from '@expo/vector-icons';
import { sendTestNotification } from '../utils/notifications';

export default function NotificationSettingsScreen() {
  const [enabled, setEnabled] = useState(true);
  const [advance, setAdvance] = useState("1"); // 1 day
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("notificationSettings").then(data => {
      if (data) {
        const { enabled, advance } = JSON.parse(data);
        setEnabled(enabled);
        setAdvance(advance);
      }
    });
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    await AsyncStorage.setItem("notificationSettings", JSON.stringify({ enabled, advance }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  const handleTestNotification = async () => {
    try {
      await sendTestNotification();
    } catch (e) {
      Alert.alert("Error", "No se pudo enviar la notificación de prueba.");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Ionicons name="notifications" size={32} color="#2563EB" style={{ marginBottom: 8 }} />
        <Text style={styles.headerTitle}>Notificaciones de eventos</Text>
        <Text style={styles.headerSubtitle}>Recibe recordatorios para no perderte tus eventos importantes.</Text>
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Recordatorios activados</Text>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: '#bdbdbd', true: '#90caf9' }}
            thumbColor={enabled ? '#fff' : '#bdbdbd'}
            ios_backgroundColor="#bdbdbd"
          />
        </View>
        <View style={{ marginTop: 18 }}>
          <Text style={styles.label}>¿Cuánto antes quieres ser avisado?</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={advance}
              onValueChange={setAdvance}
              style={[styles.picker, Platform.OS === 'ios' && styles.pickerIOS]}
              itemStyle={Platform.OS === 'ios' ? { fontSize: 16, color: '#222' } : undefined}
              mode="dropdown"
            >
              <Picker.Item label="1 hora antes" value="0.041" color={Platform.OS === 'ios' ? '#222' : undefined} />
              <Picker.Item label="1 día antes" value="1" color={Platform.OS === 'ios' ? '#222' : undefined} />
              <Picker.Item label="3 días antes" value="3" color={Platform.OS === 'ios' ? '#222' : undefined} />
            </Picker>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.7 }]}
          onPress={saveSettings}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.saveBtnText}>{saving ? "Guardando..." : saved ? "¡Guardado!" : "Guardar"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleTestNotification}
          activeOpacity={0.85}
        >
          <Ionicons name="notifications-circle-outline" size={20} color="#2563EB" style={{ marginRight: 8 }} />
          <Text style={styles.testBtnText}>Probar notificación</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f8fb',
    padding: 0,
  },
  headerCard: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingTop: 36,
    paddingBottom: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 2,
  },
  headerSubtitle: {
    color: '#607d8b',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 2,
  },
  sectionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 18,
    marginTop: 24,
    borderRadius: 14,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 16,
    color: '#37474f',
    fontWeight: '600',
  },
  pickerWrap: {
    backgroundColor: '#f3f6fa',
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e3e6eb',
  },
  picker: {
    height: 44,
    width: '100%',
  },
  pickerIOS: {
    color: '#222',
    backgroundColor: 'transparent',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 28,
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOpacity: 0.10,
    shadowRadius: 4,
    elevation: 2,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginTop: 14,
    justifyContent: 'center',
  },
  testBtnText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 15,
  },
});