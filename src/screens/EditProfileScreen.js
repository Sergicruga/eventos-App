// src/screens/EditProfileScreen.js
import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AuthContext } from "../context/AuthContext";
import { EventContext } from "../EventContext";
import { updateProfile } from "../api/users";
import { API_URL } from "../config";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getInitials = (value = "") => {
  const parts = value.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "U";
};

export default function EditProfileScreen({ navigation }) {
  const auth = useContext(AuthContext);
  const { user: userFromEventCtx, updateUser } = useContext(EventContext);
  const uid = auth?.user?.id;

  const initialName = userFromEventCtx?.name ?? auth?.user?.name ?? "";
  const initialEmail = userFromEventCtx?.email ?? auth?.user?.email ?? "";

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const nextName = userFromEventCtx?.name ?? auth?.user?.name ?? "";
    const nextEmail = userFromEventCtx?.email ?? auth?.user?.email ?? "";
    if (nextName !== name) setName(nextName);
    if (nextEmail !== email) setEmail(nextEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFromEventCtx?.name, userFromEventCtx?.email, auth?.user?.name, auth?.user?.email]);

  const isDirty = useMemo(() => {
    return (
      name.trim() !== initialName.trim() ||
      email.trim().toLowerCase() !== initialEmail.trim().toLowerCase()
    );
  }, [name, email, initialName, initialEmail]);

  const saveProfile = async () => {
    if (!uid) return;

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) return Alert.alert("Nombre requerido", "Introduce un nombre.");
    if (!trimmedEmail || !emailRegex.test(trimmedEmail)) {
      return Alert.alert("Email inválido", "Introduce un email válido.");
    }

    setSaving(true);
    try {
      const updatedUser = await updateProfile(uid, { name: trimmedName, email: trimmedEmail }, auth?.token);

      updateUser?.({
        ...(userFromEventCtx ?? auth?.user ?? {}),
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        photo: updatedUser.photo,
      });

      await auth.login({
        user: {
          ...(auth.user || {}),
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          photo: updatedUser.photo,
        },
        token: auth.token,
      });

      Alert.alert("Perfil actualizado", "Tus datos se han guardado correctamente.");
      navigation.goBack();
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("409") || msg.toLowerCase().includes("en uso")) {
        Alert.alert("Email en uso", "Ese email ya está registrado por otro usuario.");
      } else {
        Alert.alert("Error", msg || "Error actualizando perfil");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      if (!auth?.token) {
        return Alert.alert("Error", "Sesión inválida. Vuelve a iniciar sesión.");
      }

      const res = await fetch(`${API_URL}/users/me`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`,
        },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        let msg = "No se pudo eliminar la cuenta";
        try {
          msg = JSON.parse(txt)?.message || msg;
        } catch {}
        return Alert.alert("Error", msg);
      }

      await auth.logout?.();
    } catch (e) {
      Alert.alert("Error", "No se pudo eliminar la cuenta");
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["#111827", "#4f46e5"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroBadge}>
              <Ionicons name="person-circle-outline" size={28} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Editar perfil</Text>
            <Text style={styles.heroSubtitle}>
              Mantén tus datos al día y deja tu perfil listo para cualquier evento.
            </Text>
            <View style={styles.avatarRing}>
              <Text style={styles.avatarText}>{getInitials(name || initialName || email)}</Text>
            </View>
          </LinearGradient>

          <View style={styles.card}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-outline" size={18} color="#4f46e5" />
              <Text style={styles.sectionTitle}>Datos básicos</Text>
            </View>

            <Text style={styles.label}>Nombre</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color="#9ca3af" />
              <TextInput
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                placeholder="Tu nombre"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>

            <Text style={styles.label}>Email</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color="#9ca3af" />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="tu@email.com"
                placeholderTextColor="#9ca3af"
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              onPress={saveProfile}
              disabled={saving || !isDirty}
              activeOpacity={0.9}
              style={[styles.saveBtn, (!isDirty || saving) && styles.saveBtnDisabled]}
            >
              <LinearGradient
                colors={saving || !isDirty ? ["#9ca3af", "#6b7280"] : ["#4f46e5", "#6366f1"]}
                style={styles.saveBtnGradient}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Guardar cambios</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              {isDirty
                ? "Tus cambios se actualizarán en tu cuenta y en las pantallas donde aparece tu perfil."
                : "Ajusta tu nombre o email cuando quieras."}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() =>
              Alert.alert(
                "Eliminar cuenta",
                "Esta acción no se puede deshacer. ¿Seguro que quieres eliminar tu cuenta?",
                [
                  { text: "Cancelar", style: "cancel" },
                  { text: "Eliminar", style: "destructive", onPress: handleDeleteAccount },
                ]
              )
            }
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
            <Text style={styles.deleteBtnText}>Eliminar mi cuenta</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  flex: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 36,
  },
  hero: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#111827",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  heroBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.84)",
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  avatarRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.24)",
  },
  avatarText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#111827",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  label: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    color: "#111827",
  },
  saveBtn: {
    marginTop: 8,
    borderRadius: 16,
    overflow: "hidden",
  },
  saveBtnDisabled: {
    opacity: 0.8,
  },
  saveBtnGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  helperText: {
    marginTop: 10,
    color: "#6b7280",
    fontSize: 12,
    lineHeight: 18,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    paddingVertical: 13,
    borderRadius: 14,
  },
  deleteBtnText: {
    color: "#dc2626",
    fontWeight: "700",
    marginLeft: 8,
  },
});
