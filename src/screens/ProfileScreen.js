// src/screens/ProfileScreen.js
import React, { useContext, useEffect, useState } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, FlatList, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { AuthContext } from "../context/AuthContext";
import { EventContext } from "../EventContext";
import { API_URL } from "../api/config";
import { getUser, getUserCreatedEvents, uploadUserPhoto } from "../api/users";
import { useNavigation } from "@react-navigation/native";

export default function ProfileScreen() {
  const navigation = useNavigation();

  // Auth + Event contexts
  const { logout, user: authUser, token, login } = useContext(AuthContext);
  const { user: userFromEventCtx, updateUser } = useContext(EventContext);
  const uid = authUser?.id;

  // State
  const [me, setMe] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoBust, setPhotoBust] = useState(0); // <- cache-busting

  useEffect(() => {
    (async () => {
      try {
        if (!uid) return;
        const [u, evs] = await Promise.all([getUser(uid), getUserCreatedEvents(uid)]);
        setMe(u);
        setMyEvents(
          (evs || []).map(e => ({
            id: String(e.id),
            title: e.title,
            date: e.event_at?.slice(0, 10) ?? "",
            location: e.location ?? "",
            image: e.image ?? null,
            description: e.description ?? "",
            latitude: e.latitude ?? null,
            longitude: e.longitude ?? null,
            type: e.type ?? "local",
          }))
        );
        // sincroniza con EventContext para que otros sitios vean nombre/foto
        updateUser?.({ id: u.id, name: u.name, email: u.email, photo: u.photo });
      } catch (e) {
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  // Helper para construir URL absoluta de la foto
  const absolutePhoto = (photoPath) =>
    photoPath?.startsWith("http") ? photoPath : `${API_URL}${photoPath}`;

  const onChangePhoto = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      setPhotoUploading(true);

      // Subida
      const data = await uploadUserPhoto(uid, res.assets[0].uri); // { photo: "/uploads/profile_<id>.jpg" }

      // Actualiza estados locales y contextos
      setMe(prev => ({ ...(prev || {}), photo: data.photo }));
      updateUser?.({ ...(userFromEventCtx || {}), id: uid, photo: data.photo });

      // Actualiza AuthContext también (dispara re-render global y persiste en AsyncStorage)
      await login({
        user: { ...(authUser || {}), photo: data.photo },
        token,
      });

      // Cache-busting para que el <Image/> recargue sin cerrar app
      setPhotoBust(Date.now());

      Alert.alert("Foto actualizada");
    } catch (e) {
      Alert.alert("Error", "No se pudo subir la foto");
    } finally {
      setPhotoUploading(false);
    }
  };

  if (!uid) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text>Inicia sesión para ver tu perfil.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Construye la URI con cache-busting
  const basePhoto = me?.photo ? absolutePhoto(me.photo) : null;
  const avatarUri = basePhoto ? `${basePhoto}?t=${photoBust}` : null;

  return (
    <View style={{ flex: 1 }}>
      {/* Header perfil */}
      <View style={{ padding: 24, alignItems: "center", backgroundColor: "#f5f7fb" }}>
        <TouchableOpacity onPress={onChangePhoto} disabled={photoUploading} style={{ alignItems: "center" }}>
          <Image
            source={avatarUri ? { uri: avatarUri } : require("../../assets/icon.png")}
            style={{ width: 110, height: 110, borderRadius: 55, marginBottom: 8 }}
          />
          {photoUploading ? <ActivityIndicator style={{ position: "absolute", left: 45, top: 45 }} /> : null}
        </TouchableOpacity>

        <Text style={{ fontSize: 18, fontWeight: "700" }}>{me?.name || "-"}</Text>
        <Text style={{ color: "#6b7280", marginTop: 2 }}>{me?.email || "-"}</Text>

        <TouchableOpacity
          onPress={() => navigation.navigate("EditProfile")}
          style={{ marginTop: 12, backgroundColor: "#1f2937", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 }}
          activeOpacity={0.85}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Editar perfil</Text>
        </TouchableOpacity>
      </View>

      {/* Mis eventos */}
      <Text style={{ paddingHorizontal: 16, paddingTop: 12, fontSize: 16, fontWeight: "700" }}>Mis eventos</Text>
      <FlatList
        data={myEvents}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={<Text>No has creado eventos.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate("EventDetail", { event: item })}
            activeOpacity={0.85}
            style={{ flexDirection: "row", padding: 12, borderWidth: 1, borderColor: "#eee", borderRadius: 12, marginBottom: 12 }}
          >
            <Image
              source={item.image ? { uri: item.image } : require("../../assets/iconoApp.png")}
              style={{ width: 64, height: 64, borderRadius: 8, marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600" }}>{item.title}</Text>
              <Text style={{ color: "#555" }}>
                {item.date} · {item.location}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Logout flotante */}
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
          elevation: 5,
        }}
      >
        <Ionicons name="log-out-outline" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
