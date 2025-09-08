// src/screens/ProfileScreen.js
import React, { useContext, useState } from "react";
import { View, Text, TextInput, Button, Image, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { EventContext } from "../EventContext";
import { AuthContext } from "../context/AuthContext";

// BASE de API según plataforma / entorno
const API_URL =
  Platform.select({
    android: "http://10.0.2.2:4000", // emulador Android
    ios: "http://localhost:4000",    // simulador iOS
    default: "http://localhost:4000" // desarrollo en web/Expo Go con túnel: cámbialo por tu IP local si usas dispositivo
  });

export default function ProfileScreen() {
  const { user, updateUser } = useContext(EventContext);
  const { logout } = useContext(AuthContext);

  const [name, setName] = useState(user?.name || "");
  const [photo, setPhoto] = useState(user?.photo || null);
  const [saving, setSaving] = useState(false);

  // Cambiar nombre
  const saveName = async () => {
    if (!user?.id) return Alert.alert("Usuario no disponible");
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      updateUser({ ...user, name });
      Alert.alert("Nombre actualizado");
    } catch {
      Alert.alert("Error actualizando nombre");
    } finally {
      setSaving(false);
    }
  };

  // Seleccionar foto
  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      uploadPhoto(result.assets[0].uri);
    }
  };

  // Subir foto
  const uploadPhoto = async (uri) => {
    if (!user?.id) return Alert.alert("Usuario no disponible");
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("photo", {
        uri,
        name: "profile.jpg",
        type: "image/jpeg",
      });

      // Importante: NO fijar "Content-Type" manualmente (RN añade boundary)
      const res = await fetch(`${API_URL}/users/${user.id}/photo`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      const data = await res.json();

      // Si tu backend devuelve { photo: "/uploads/..." }:
      const absolutePhoto = data.photo?.startsWith("http")
        ? data.photo
        : `${API_URL}${data.photo}`;

      setPhoto(absolutePhoto);
      updateUser({ ...user, photo: data.photo });
      Alert.alert("Foto actualizada");
    } catch {
      Alert.alert("Error subiendo foto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: "center", padding: 24 }}>
      <TouchableOpacity onPress={pickPhoto} style={{ alignItems: "center" }}>
        <Image
          source={
            photo
              ? { uri: photo.startsWith("http") ? photo : `${API_URL}${photo}` }
              : require("../../assets/icon.png")
          }
          style={{ width: 120, height: 120, borderRadius: 60, marginBottom: 12 }}
        />
        <Text style={{ color: "#1976d2", marginBottom: 16 }}>Cambiar foto</Text>
      </TouchableOpacity>

      <Text style={{ alignSelf: "flex-start", marginLeft: "10%", marginBottom: 6 }}>Nombre:</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, borderRadius: 8, padding: 10, width: "80%", marginBottom: 12, borderColor: "#E5E7EB" }}
      />
      <Button title="Guardar nombre" onPress={saveName} disabled={saving} />

      {saving && <ActivityIndicator style={{ marginTop: 16 }} />}

      {/* Botón de Cerrar sesión (estilo tipo FAB pero dentro del perfil) */}
      <TouchableOpacity
        onPress={logout}
        activeOpacity={0.85}
        style={{
          position: "absolute",
          right: 24,
          bottom: 24,
          backgroundColor: "#4B5563",
          width: 56,
          height: 56,
          borderRadius: 28,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 3.84,
          elevation: 5,
        }}
      >
        <Ionicons name="log-out-outline" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
