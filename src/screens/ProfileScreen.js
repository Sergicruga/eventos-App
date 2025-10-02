// src/screens/ProfileScreen.js
import React, { useContext, useEffect, useState, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, FlatList, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

import { AuthContext } from "../context/AuthContext";
import { EventContext } from "../EventContext";
import { API_URL } from "../api/config";
import { getUser, getUserCreatedEvents, uploadUserPhoto } from "../api/users";

export default function ProfileScreen() {
  const navigation = useNavigation();

  // Contextos
  const { logout, user: authUser, token, login } = useContext(AuthContext);
  const { user: evCtxUser, updateUser } = useContext(EventContext);
  const uid = authUser?.id;

  // Estado local
  const [me, setMe] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoBust, setPhotoBust] = useState(0); // cache-busting

  // Helpers
  const absolutePhoto = (photoPath) =>
    photoPath?.startsWith("http") ? photoPath : `${API_URL}${photoPath}`;

  const hydrate = useCallback(async () => {
    if (!uid) return;
    try {
      setLoading(true);
      const [u, evs] = await Promise.all([getUser(uid), getUserCreatedEvents(uid)]);

      // Estado local de pantalla
      setMe(prev => prev && prev.id === u.id ? { ...prev, ...u } : u);
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

      // Solo propagar a contextos si hay cambios (evita renders en bucle)
      if (updateUser) {
        const needEvCtx =
          evCtxUser?.id !== u.id ||
          evCtxUser?.name !== u.name ||
          evCtxUser?.email !== u.email ||
          evCtxUser?.photo !== u.photo;
        if (needEvCtx) updateUser({ id: u.id, name: u.name, email: u.email, photo: u.photo });
      }

      const needAuth =
        authUser?.id !== u.id ||
        authUser?.name !== u.name ||
        authUser?.email !== u.email ||
        authUser?.photo !== u.photo;
      if (needAuth) await login({ user: { ...(authUser || {}), id: u.id, name: u.name, email: u.email, photo: u.photo }, token });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [uid, token]); // 👈 deps mínimas y estables

  // Carga inicial
  useEffect(() => { hydrate(); }, [hydrate]);

  // Recarga al volver a enfocar la pestaña de Perfil
  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [uid]) // 👈 solo re-hidrata cuando el usuario cambia o al enfocar
  );

  // Si cambia el usuario global por cualquier motivo, refleja en pantalla (sin obligar a refetch)
  useEffect(() => {
    if (!uid) return;
    if (evCtxUser?.id === uid) {
      setMe(prev => {
        const next = {
          id: uid,
          name: evCtxUser.name ?? prev?.name,
          email: evCtxUser.email ?? prev?.email,
          photo: evCtxUser.photo ?? prev?.photo,
        };
        const equal =
          prev &&
          prev.id === next.id &&
          prev.name === next.name &&
          prev.email === next.email &&
          prev.photo === next.photo;
        return equal ? prev : { ...(prev || {}), ...next };
      });
    }
  }, [evCtxUser?.name, evCtxUser?.email, evCtxUser?.photo, uid]);

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

      // Subir
      const data = await uploadUserPhoto(uid, res.assets[0].uri); // { photo: "/uploads/profile_<id>.jpg" }

      // Actualiza local
      setMe(prev => ({ ...(prev || {}), photo: data.photo }));
      // Propaga a EventContext
      updateUser?.({ ...(evCtxUser || {}), id: uid, photo: data.photo });
      // Propaga a AuthContext para re-render global + persistir
      await login({ user: { ...(authUser || {}), photo: data.photo }, token });

      // Cache-busting para forzar recarga de Image
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

  // Construcción de datos para mostrar (si algo falta en `me`, cae al AuthContext)
  const displayName = me?.name ?? authUser?.name ?? "-";
  const displayEmail = me?.email ?? authUser?.email ?? "-";
  const basePhoto = me?.photo ? absolutePhoto(me.photo) : (authUser?.photo ? absolutePhoto(authUser.photo) : null);
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

        <Text style={{ fontSize: 18, fontWeight: "700" }}>{displayName}</Text>
        <Text style={{ color: "#6b7280", marginTop: 2 }}>{displayEmail}</Text>

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
