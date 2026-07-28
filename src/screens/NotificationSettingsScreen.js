import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  Modal,
  Linking,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { sendTestNotification, requestNotificationPermission } from "../utils/notifications";
import * as Notifications from "expo-notifications";

const DEFAULT_SETTINGS = {
  enabled: true,
  // advance stored in minutes (60 = 1 hour)
  advance: "60",
};

export default function NotificationSettingsScreen() {
  const [enabled, setEnabled] = useState(DEFAULT_SETTINGS.enabled);
  const [advance, setAdvance] = useState(DEFAULT_SETTINGS.advance);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem("notificationSettings");
        if (!raw) return;

        const parsed = JSON.parse(raw);
        if (!mounted) return;

        setEnabled(parsed?.enabled ?? DEFAULT_SETTINGS.enabled);
        setAdvance(String(parsed?.advance ?? DEFAULT_SETTINGS.advance));
      } catch (error) {
        console.warn("Could not load notification settings", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      await AsyncStorage.setItem(
        "notificationSettings",
        JSON.stringify({ enabled, advance })
      );

      // if user disabled notifications, clear scheduled notifications
      if (!enabled) {
        try {
          await Notifications.cancelAllScheduledNotificationsAsync();
        } catch (e) {
          console.warn("Could not cancel scheduled notifications", e);
        }
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 1400);
    } catch (error) {
      Alert.alert("Error", "No se pudieron guardar las preferencias.");
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      await sendTestNotification();
      Alert.alert("Listo", "Se ha enviado una notificación de prueba.");
    } catch (error) {
      Alert.alert("Error", "No se pudo enviar la notificación de prueba.");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={["#111827", "#4f46e5"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIconWrap}>
            <Ionicons name="notifications-outline" size={28} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Notificaciones</Text>
          <Text style={styles.heroSubtitle}>
            Mantén tus eventos a la vista con recordatorios precisos y sin ruido.
          </Text>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.optionRow}>
            <View style={styles.optionTextWrap}>
              <Text style={styles.optionLabel}>Recordatorios activados</Text>
              <Text style={styles.optionCaption}>
                Activa o desactiva los avisos para tus próximos eventos.
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={async (value) => {
                if (value) {
                  const perms = await Notifications.getPermissionsAsync();
                  if (perms.status !== "granted") {
                    setShowPermissionModal(true);
                    return;
                  }
                }

                // if disabling, clear scheduled notifications
                if (!value) {
                  try {
                    await Notifications.cancelAllScheduledNotificationsAsync();
                  } catch (e) {
                    console.warn("Could not cancel scheduled notifications", e);
                  }
                }

                setEnabled(value);
              }}
              trackColor={{ false: "#d1d5db", true: "#93c5fd" }}
              thumbColor={enabled ? "#ffffff" : "#f3f4f6"}
              ios_backgroundColor="#d1d5db"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.sectionBlock}>
            <Text style={styles.optionLabel}>¿Cuánto antes quieres ser avisado?</Text>
            <Text style={styles.optionCaption}>
              Elige una ventana de aviso que se adapte a tu agenda.
            </Text>
            <View style={styles.pickerWrap}>
              {loading ? (
                <ActivityIndicator color="#4f46e5" />
              ) : (
                <Picker
                  selectedValue={advance}
                  onValueChange={(value) => setAdvance(String(value))}
                  style={[styles.picker, Platform.OS === "ios" && styles.pickerIOS]}
                  itemStyle={Platform.OS === "ios" ? { fontSize: 16, color: "#111827" } : undefined}
                  mode="dropdown"
                >
                  <Picker.Item label="1 hora antes" value="60" />
                  <Picker.Item label="1 día antes" value="1440" />
                  <Picker.Item label="3 días antes" value="4320" />
                </Picker>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
            onPress={saveSettings}
            disabled={saving}
            activeOpacity={0.9}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="save-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {saved ? "¡Guardado!" : "Guardar preferencias"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={handleTestNotification} activeOpacity={0.9}>
            <Ionicons name="notifications-circle-outline" size={18} color="#4f46e5" />
            <Text style={styles.secondaryBtnText}>Probar notificación</Text>
          </TouchableOpacity>
        </View>

        <Modal
          visible={showPermissionModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowPermissionModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <LinearGradient
                colors={["#4f46e5", "#6366f1"]}
                style={{ borderRadius: 12, padding: 18 }}
              >
                <Text style={styles.modalTitle}>Habilitar notificaciones</Text>
                <Text style={styles.modalBody}>
                  Para recibir recordatorios necesitas permitir notificaciones en la configuración del dispositivo.
                </Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalButtonSecondary}
                    onPress={() => setShowPermissionModal(false)}
                  >
                    <Text style={styles.modalButtonTextSecondary}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalButtonPrimary}
                    onPress={async () => {
                      setShowPermissionModal(false);
                      const granted = await requestNotificationPermission();
                      if (!granted) {
                        // open settings as fallback
                        Linking.openSettings();
                      } else {
                        setEnabled(true);
                      }
                    }}
                  >
                    <Text style={styles.modalButtonTextPrimary}>Solicitar permiso</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 16,
    paddingBottom: 28,
  },
  hero: {
    borderRadius: 24,
    padding: 22,
    marginBottom: 16,
    shadowColor: "#111827",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
  },
  heroSubtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.84)",
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#eef2ff",
    shadowColor: "#111827",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  optionTextWrap: {
    flex: 1,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  optionCaption: {
    marginTop: 4,
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: "#eef2ff",
    marginVertical: 16,
  },
  sectionBlock: {
    marginTop: 2,
  },
  pickerWrap: {
    marginTop: 10,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f8fafc",
  },
  picker: {
    height: 48,
    width: "100%",
  },
  pickerIOS: {
    color: "#111827",
    backgroundColor: "transparent",
  },
  primaryBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 13,
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryBtn: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 14,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: "#4f46e5",
    fontWeight: "700",
    fontSize: 15,
  },

  /* Modal styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 12,
    overflow: "hidden",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },
  modalBody: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    marginBottom: 14,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  modalButtonPrimary: {
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  modalButtonSecondary: {
    backgroundColor: "transparent",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 8,
  },
  modalButtonTextPrimary: {
    color: "#4f46e5",
    fontWeight: "700",
  },
  modalButtonTextSecondary: {
    color: "rgba(255,255,255,0.9)",
    fontWeight: "700",
  },
});
