// src/screens/EditProfileScreen.js
import React, { useContext, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from "react-native";
import { AuthContext } from "../context/AuthContext";
import { EventContext } from "../EventContext";
import { updateProfile, changePassword } from "../api/users";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditProfileScreen({ navigation }) {
  const auth = useContext(AuthContext);
  const { user: userFromEventCtx, updateUser } = useContext(EventContext);
  const uid = auth?.user?.id;

  // Hidratar con el user actual (EventContext tiene prioridad si trae cambios más frescos)
  const initialName = userFromEventCtx?.name ?? auth?.user?.name ?? "";
  const initialEmail = userFromEventCtx?.email ?? auth?.user?.email ?? "";

  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [saving, setSaving] = useState(false);

  // password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  // Rehidratar inputs si el usuario global cambió fuera de esta pantalla
  useEffect(() => {
    const nextName = userFromEventCtx?.name ?? auth?.user?.name ?? "";
    const nextEmail = userFromEventCtx?.email ?? auth?.user?.email ?? "";
    if (nextName !== name) setName(nextName);
    if (nextEmail !== email) setEmail(nextEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userFromEventCtx?.name, userFromEventCtx?.email, auth?.user?.name, auth?.user?.email]);

  const saveProfile = async () => {
    if (!uid) return;
    if (!name.trim()) return Alert.alert("Nombre requerido", "Introduce un nombre.");
    if (!email.trim() || !emailRegex.test(email.trim())) {
      return Alert.alert("Email inválido", "Introduce un email válido.");
    }

    setSaving(true);
    try {
      const u = await updateProfile(uid, { name: name.trim(), email: email.trim() });
      // 1) Propaga a EventContext
      updateUser?.({ id: u.id, name: u.name, email: u.email, photo: u.photo });
      // 2) Propaga a AuthContext (re-render global + persistencia)
      await auth.login({
        user: { ...(auth.user || {}), id: u.id, name: u.name, email: u.email, photo: u.photo },
        token: auth.token,
      });
      Alert.alert("Perfil actualizado");
      navigation.goBack();
    } catch (e) {
      // Manejo de conflicto de email (409) u otros errores
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

  const savePassword = async () => {
    if (!uid) return;
    if (!currentPassword || !newPassword) return Alert.alert("Campos requeridos", "Rellena ambas contraseñas.");
    if (newPassword.length < 6) return Alert.alert("Contraseña débil", "La nueva contraseña debe tener al menos 6 caracteres.");

    setChangingPwd(true);
    try {
      await changePassword(uid, currentPassword, newPassword);
      Alert.alert("Contraseña actualizada");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.toLowerCase().includes("incorrecta") || msg.includes("401")) {
        Alert.alert("Error", "La contraseña actual no es correcta.");
      } else {
        Alert.alert("Error", msg || "No se pudo cambiar la contraseña");
      }
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 12 }}>Editar perfil</Text>

      <Text style={{ marginBottom: 6 }}>Nombre</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}
      />

      <Text style={{ marginBottom: 6 }}>Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginBottom: 16 }}
      />

      <TouchableOpacity
        onPress={saveProfile}
        disabled={saving}
        style={{ backgroundColor: "#111827", padding: 14, borderRadius: 12, alignItems: "center" }}
        activeOpacity={0.85}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "600" }}>Guardar</Text>}
      </TouchableOpacity>

      <View style={{ height: 24 }} />

      <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>Cambiar contraseña</Text>
      <TextInput
        placeholder="Contraseña actual"
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
        style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginBottom: 12 }}
      />
      <TextInput
        placeholder="Nueva contraseña"
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
        style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginBottom: 16 }}
      />

      <TouchableOpacity
        onPress={savePassword}
        disabled={changingPwd}
        style={{ backgroundColor: "#2563eb", padding: 14, borderRadius: 12, alignItems: "center" }}
        activeOpacity={0.85}
      >
        {changingPwd ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "600" }}>Actualizar contraseña</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
