import React, { useContext, useState } from "react";
import { View, Text, TextInput, Button, Image, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { EventContext } from "../EventContext";

const API_URL = "http://localhost:4000";

export default function ProfileScreen() {
  const { user, updateUser } = useContext(EventContext);
  const [name, setName] = useState(user.name || "");
  const [photo, setPhoto] = useState(user.photo || null);
  const [saving, setSaving] = useState(false);

  // Cambiar nombre
  const saveName = async () => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      updateUser({ ...user, name });
      Alert.alert("Nombre actualizado");
    } catch {
      Alert.alert("Error actualizando nombre");
    }
    setSaving(false);
  };

  // Cambiar foto
  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      uploadPhoto(result.assets[0].uri);
    }
  };

  const uploadPhoto = async (uri) => {
    setSaving(true);
    const formData = new FormData();
    formData.append("photo", {
      uri,
      name: "profile.jpg",
      type: "image/jpeg",
    });
    try {
      const res = await fetch(`${API_URL}/users/${user.id}/photo`, {
        method: "POST",
        headers: { "Content-Type": "multipart/form-data" },
        body: formData,
      });
      const data = await res.json();
      setPhoto(`${API_URL}${data.photo}`);
      updateUser({ ...user, photo: data.photo });
      Alert.alert("Foto actualizada");
    } catch {
      Alert.alert("Error subiendo foto");
    }
    setSaving(false);
  };

  return (
    <View style={{ flex: 1, alignItems: "center", padding: 24 }}>
      <TouchableOpacity onPress={pickPhoto}>
        <Image
          source={photo ? { uri: photo.startsWith("http") ? photo : `${API_URL}${photo}` } : require("../../assets/icon.png")}
          style={{ width: 120, height: 120, borderRadius: 60, marginBottom: 16 }}
        />
        <Text style={{ color: "#1976d2", marginBottom: 16 }}>Cambiar foto</Text>
      </TouchableOpacity>
      <Text>Nombre:</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, borderRadius: 6, padding: 8, width: "80%", marginBottom: 16 }}
      />
      <Button title="Guardar nombre" onPress={saveName} disabled={saving} />
      {saving && <ActivityIndicator style={{ marginTop: 16 }} />}
    </View>
  );
}
