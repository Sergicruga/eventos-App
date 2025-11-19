// src/screens/ProfileScreen.js
import React, { useContext, useEffect, useState, useCallback } from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, FlatList, Alert } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { AuthContext } from "../context/AuthContext";
import { EventContext } from "../EventContext";
import { API_URL } from "../api/config";
import {
  getUser,
  getUserCreatedEvents,
  getUserAttendingEvents,
  uploadUserPhoto,
} from "../api/users";

/* -----------------------------------------------------------------------------
  Helpers de fecha
----------------------------------------------------------------------------- */
function toLocalMidnightMs(dateStr) {
  if (!dateStr) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    const [, y, mm, dd] = m;
    return new Date(Number(y), Number(mm) - 1, Number(dd), 0, 0, 0, 0).getTime();
  }
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return NaN;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}
function todayLocalMidnightMs() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
}
function isUpcoming(dateStr) {
  const e = toLocalMidnightMs(dateStr);
  const t = todayLocalMidnightMs();
  return !Number.isNaN(e) && e >= t;
}

/* -----------------------------------------------------------------------------
  Formato fecha/hora
----------------------------------------------------------------------------- */
function formatEventDate(dateStr) {
  if (!dateStr) return "";
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}

function getEventTime(ev) {
  if (ev?.timeStart && /^\d{2}:\d{2}/.test(ev.timeStart)) {
    return ev.timeStart.slice(0, 5);
  }
  const iso = ev?.startsAt || ev?.starts_at || ev?.event_at;
  if (typeof iso === "string" && iso.length >= 16) {
    return iso.slice(11, 16); // HH:mm
  }
  return "";
}

/* -----------------------------------------------------------------------------
  Imagen miniatura evento
----------------------------------------------------------------------------- */
function EventThumbImage({ eventId, serverImage, style }) {
  const { getEffectiveEventImage, getEventImageSource, overridesReady } = useContext(EventContext);
  const [stage, setStage] = React.useState(0); // 0: efectiva, 1: backup web, 2: asset local

  const effective = getEffectiveEventImage?.(eventId, serverImage) ?? serverImage ?? null;

  React.useEffect(() => {
    setStage(0);
  }, [eventId, serverImage, overridesReady]);

  if (stage === 2) {
    return (
      <Image
        source={require("../../assets/iconoApp.png")}
        style={style}
        resizeMode="cover"
      />
    );
  }

  const src =
    stage === 1
      ? { uri: "https://picsum.photos/400/300" }
      : getEventImageSource?.(effective) ?? { uri: "https://picsum.photos/400/300" };

  return (
    <Image
      source={src}
      style={style}
      resizeMode="cover"
      onError={() => setStage(prev => (prev < 2 ? prev + 1 : 2))}
    />
  );
}

/* -----------------------------------------------------------------------------
  Normalizador de eventos (soporta distintas formas)
----------------------------------------------------------------------------- */
function normalizeEvents(rawEvents, getEffectiveEventImage, { onlyUpcoming = true } = {}) {
  const mapped = (rawEvents || []).map(e => {
    // soportar event_at, date, starts_at...
    const rawDate =
      e.event_at ||
      e.date ||
      e.eventAt ||
      (typeof e.starts_at === "string" ? e.starts_at.slice(0, 10) : null);

    const date = rawDate ? String(rawDate).slice(0, 10) : "";

    return {
      id: String(e.id),
      title: e.title,
      date,
      location: e.location ?? "",
      image: getEffectiveEventImage?.(e.id, e.image) ?? e.image ?? null,
      description: e.description ?? "",
      latitude: e.latitude ?? null,
      longitude: e.longitude ?? null,
      type: e.type ?? "local",
      timeStart: e.time_start ?? e.timeStart ?? null,
      startsAt: e.starts_at ?? e.startsAt ?? null,
      event_at: e.event_at ?? null,
    };
  });

  const filtered = onlyUpcoming
    ? mapped.filter(ev => isUpcoming(ev.date))
    : mapped;

  return filtered.sort((a, b) => toLocalMidnightMs(a.date) - toLocalMidnightMs(b.date));
}

export default function ProfileScreen() {
  const navigation = useNavigation();

  // Contextos
  const { logout, user: authUser, token, login } = useContext(AuthContext);
  const { user: evCtxUser, updateUser, getEffectiveEventImage } = useContext(EventContext);
  const uid = authUser?.id;

  // Estado local
  const [me, setMe] = useState(null);
  const [myEvents, setMyEvents] = useState([]);         // creados
  const [attendingEvents, setAttendingEvents] = useState([]); // a los que voy
  const [activeTab, setActiveTab] = useState("created"); // "created" | "attending"
  const [loading, setLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoBust, setPhotoBust] = useState(0);

  // Helpers
  const absolutePhoto = (photoPath) =>
    photoPath?.startsWith("http") ? photoPath : `${API_URL}${photoPath}`;

  const hydrate = useCallback(async () => {
    if (!uid) return;
    try {
      setLoading(true);

      const [u, evsCreated, evsAttending] = await Promise.all([
        getUser(uid),
        getUserCreatedEvents(uid),
        getUserAttendingEvents(uid),
      ]);

      // Datos de usuario
      setMe(prev => (prev && prev.id === u.id ? { ...prev, ...u } : u));

      // 👇 CREADOS → TODOS (pasados y futuros)
      setMyEvents(normalizeEvents(evsCreated, getEffectiveEventImage, { onlyUpcoming: true }));

      // 👇 A LOS QUE VOY → SOLO PRÓXIMOS
      setAttendingEvents(normalizeEvents(evsAttending, getEffectiveEventImage, { onlyUpcoming: true }));

      // Sincroniza contextos
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
      if (needAuth)
        await login({
          user: { ...(authUser || {}), id: u.id, name: u.name, email: u.email, photo: u.photo },
          token,
        });
    } catch (e) {
      console.log("Error en hydrate profile:", e);
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [uid, token, evCtxUser?.id, evCtxUser?.name, evCtxUser?.email, evCtxUser?.photo, updateUser, login, authUser, getEffectiveEventImage]);

  // Carga inicial
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Recarga al volver al perfil
  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [uid, hydrate])
  );

  // Refleja cambios del EventContext
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permiso requerido", "Se necesita permiso para acceder a tus fotos.");
        return;
      }

      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;

      setPhotoUploading(true);

      const data = await uploadUserPhoto(uid, res.assets[0].uri);

      setMe(prev => ({ ...(prev || {}), photo: data.photo }));
      updateUser?.({ ...(evCtxUser || {}), id: uid, photo: data.photo });
      await login({ user: { ...(authUser || {}), photo: data.photo }, token });

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

  // Datos a mostrar
  const displayName = me?.name ?? authUser?.name ?? "-";
  const displayEmail = me?.email ?? authUser?.email ?? "-";
  const basePhoto = me?.photo
    ? absolutePhoto(me.photo)
    : authUser?.photo
    ? absolutePhoto(authUser.photo)
    : null;
  const avatarUri = basePhoto ? `${basePhoto}?t=${photoBust}` : null;

  const eventsData = activeTab === "created" ? myEvents : attendingEvents;

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
          style={{
            marginTop: 12,
            backgroundColor: "#1f2937",
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 10,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Editar perfil</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate("NotificationSettings")}
          style={{
            marginTop: 12,
            backgroundColor: "#2563eb",
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 10,
          }}
          activeOpacity={0.85}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Notificaciones</Text>
        </TouchableOpacity>
      </View>

      {/* Título + tabs */}
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "700" }}>Mis eventos</Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          marginTop: 8,
          marginHorizontal: 16,
          borderRadius: 999,
          backgroundColor: "#e5e7eb",
          padding: 2,
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 999,
            alignItems: "center",
            backgroundColor: activeTab === "created" ? "#ffffff" : "transparent",
          }}
          onPress={() => setActiveTab("created")}
          activeOpacity={0.8}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: activeTab === "created" ? "700" : "500",
              color: activeTab === "created" ? "#111827" : "#4b5563",
            }}
          >
            Creados
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 999,
            alignItems: "center",
            backgroundColor: activeTab === "attending" ? "#ffffff" : "transparent",
          }}
          onPress={() => setActiveTab("attending")}
          activeOpacity={0.8}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: activeTab === "attending" ? "700" : "500",
              color: activeTab === "attending" ? "#111827" : "#4b5563",
            }}
          >
            A los que voy
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={eventsData}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        ListEmptyComponent={
          <Text>
            {activeTab === "created"
              ? "No tienes eventos creados."
              : "No estás apuntado a ningún evento próximo."}
          </Text>
        }
        renderItem={({ item }) => {
          const timeLabel = getEventTime(item);
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("EventDetail", { event: item })}
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                padding: 12,
                borderWidth: 1,
                borderColor: "#eee",
                borderRadius: 12,
                marginBottom: 12,
              }}
            >
              <EventThumbImage
                eventId={item.id}
                serverImage={item.image}
                style={{ width: 64, height: 64, borderRadius: 8, marginRight: 12 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600" }}>{item.title}</Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color="#555"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ color: "#555", fontSize: 13 }}>
                    {formatEventDate(item.date)}
                  </Text>
                  {timeLabel ? (
                    <>
                      <Text style={{ color: "#555", fontSize: 13 }}> · </Text>
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color="#555"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={{ color: "#555", fontSize: 13 }}>{timeLabel}</Text>
                    </>
                  ) : null}
                  <Text style={{ color: "#555", fontSize: 13 }}> · {item.location}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
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
