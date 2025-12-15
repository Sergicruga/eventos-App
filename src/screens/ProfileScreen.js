// src/screens/ProfileScreen.js
import React, { useContext, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation, useFocusEffect, useRoute } from "@react-navigation/native";
import { AuthContext } from "../context/AuthContext";
import { EventContext } from "../EventContext";
import { API_URL } from "../api/config";
import {
  getUser,
  getUserCreatedEvents,
  getUserAttendingEvents,
  uploadUserPhoto,
} from "../api/users";
import { SafeAreaView } from "react-native-safe-area-context";

/* -----------------------------------------------------------------------------  
  Helpers de fecha  
----------------------------------------------------------------------------- */
function toLocalMidnightMs(dateStr) {
  if (!dateStr) return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (m) {
    const [, y, mm, dd] = m;
    return new Date(
      Number(y),
      Number(mm) - 1,
      Number(dd),
      0,
      0,
      0,
      0
    ).getTime();
  }
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return NaN;
  const d = new Date(t);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
}
function todayLocalMidnightMs() {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
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
  const {
    getEffectiveEventImage,
    getEventImageSource,
    overridesReady,
  } = useContext(EventContext);
  const [stage, setStage] = React.useState(0); // 0: efectiva, 1: backup web, 2: asset local

  const effective =
    getEffectiveEventImage?.(eventId, serverImage) ??
    serverImage ??
    null;

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
      : getEventImageSource?.(effective) ?? {
          uri: "https://picsum.photos/400/300",
        };

  return (
    <Image
      source={src}
      style={style}
      resizeMode="cover"
      onError={() =>
        setStage((prev) => (prev < 2 ? prev + 1 : 2))
      }
    />
  );
}

/* -----------------------------------------------------------------------------  
  Normalizador de eventos  
----------------------------------------------------------------------------- */
function normalizeEvents(
  rawEvents,
  getEffectiveEventImage,
  { onlyUpcoming = true } = {}
) {
  const mapped = (rawEvents || []).map((e) => {
    const rawDate =
      e.event_at ||
      e.date ||
      e.eventAt ||
      (typeof e.starts_at === "string"
        ? e.starts_at.slice(0, 10)
        : null);

    const date = rawDate ? String(rawDate).slice(0, 10) : "";

    return {
      id: String(e.id),
      title: e.title,
      date,
      location: e.location ?? "",
      image:
        getEffectiveEventImage?.(e.id, e.image) ??
        e.image ??
        null,
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
    ? mapped.filter((ev) => isUpcoming(ev.date))
    : mapped;

  return filtered.sort(
    (a, b) => toLocalMidnightMs(a.date) - toLocalMidnightMs(b.date)
  );
}

/* -----------------------------------------------------------------------------  
  Merge con eventos del EventContext  
----------------------------------------------------------------------------- */
function mergeWithContextEvents(rawEvents, ctxEvents) {
  const ctxMap = Object.fromEntries(
    (ctxEvents || []).map((e) => [String(e.id), e])
  );

  return (rawEvents || []).map((ev) => {
    const ctx = ctxMap[String(ev.id)];
    if (!ctx) return ev;

    return {
      ...ev,
      date: ctx.date ?? ev.date,
      time_start:
        ctx.timeStart ?? ev.time_start ?? ev.timeStart ?? null,
      timeStart: ctx.timeStart ?? ev.timeStart ?? null,
      starts_at:
        ctx.startsAt ??
        ev.starts_at ??
        ev.startsAt ??
        null,
      startsAt: ctx.startsAt ?? ev.startsAt ?? null,
      event_at:
        ctx.startsAt ??
        ctx.event_at ??
        ev.event_at ??
        null,
    };
  });
}

/* -----------------------------------------------------------------------------  
  COMPONENTE  
----------------------------------------------------------------------------- */
export default function ProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  // Contextos
  const {
    logout,
    user: authUser,
    token,
    login,
  } = useContext(AuthContext);
  const {
    user: evCtxUser,
    updateUser,
    getEffectiveEventImage,
    events,
  } = useContext(EventContext);

  // userId recibido por params (cuando vienes desde un asistente)
  const routeUserIdRaw = route?.params?.userId;
  const authUid = authUser?.id ?? null;
  const viewedUserId =
    routeUserIdRaw != null ? String(routeUserIdRaw) : authUid;

  // ¿Estoy viendo mi propio perfil o el de otro usuario?
  const isMe =
    routeUserIdRaw == null ||
    (authUid != null &&
      String(authUid) === String(routeUserIdRaw));

  // Estado local
  const [me, setMe] = useState(null);
  const [myEvents, setMyEvents] = useState([]); // creados
  const [attendingEvents, setAttendingEvents] = useState([]); // a los que voy / va
  const [activeTab, setActiveTab] = useState("created"); // "created" | "attending"
  const [loading, setLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoBust, setPhotoBust] = useState(0);

  // Helpers
  const absolutePhoto = (photoPath) =>
    photoPath?.startsWith("http")
      ? photoPath
      : `${API_URL}${photoPath}`;

  const hydrate = useCallback(
    async () => {
      if (!viewedUserId) return;
      try {
        setLoading(true);

        // 👇 Cargamos SIEMPRE el usuario que estamos viendo (propio u otro)
        const [u, evsCreated, evsAttending] = await Promise.all([
          getUser(viewedUserId),
          getUserCreatedEvents(viewedUserId),
          getUserAttendingEvents(viewedUserId),
        ]);

        // Datos de usuario
        setMe((prev) =>
          prev && prev.id === u.id ? { ...prev, ...u } : u
        );

        // Merge con eventos del contexto
        const createdMerged = mergeWithContextEvents(
          evsCreated,
          events
        );
        const attendingMerged = mergeWithContextEvents(
          evsAttending,
          events
        );

        setMyEvents(
          normalizeEvents(createdMerged, getEffectiveEventImage, {
            onlyUpcoming: true,
          })
        );
        setAttendingEvents(
          normalizeEvents(
            attendingMerged,
            getEffectiveEventImage,
            { onlyUpcoming: true }
          )
        );

        // 🔒 Solo sincronizamos con contextos si es MI perfil
        if (isMe && updateUser) {
          const needEvCtx =
            evCtxUser?.id !== u.id ||
            evCtxUser?.name !== u.name ||
            evCtxUser?.email !== u.email ||
            evCtxUser?.photo !== u.photo;
          if (needEvCtx)
            updateUser({
              id: u.id,
              name: u.name,
              email: u.email,
              photo: u.photo,
            });
        }

        if (isMe) {
          const needAuth =
            authUser?.id !== u.id ||
            authUser?.name !== u.name ||
            authUser?.email !== u.email ||
            authUser?.photo !== u.photo;
          if (needAuth)
            await login({
              user: {
                ...(authUser || {}),
                id: u.id,
                name: u.name,
                email: u.email,
                photo: u.photo,
              },
              token,
            });
        }
      } catch (e) {
        console.log("Error en hydrate profile:", e);
        Alert.alert("Error", e.message);
      } finally {
        setLoading(false);
      }
    },
    [
      viewedUserId,
      token,
      evCtxUser?.id,
      evCtxUser?.name,
      evCtxUser?.email,
      evCtxUser?.photo,
      updateUser,
      login,
      authUser,
      getEffectiveEventImage,
      events,
      isMe,
    ]
  );

  // Carga inicial
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Recarga al enfocar la pantalla
  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [hydrate])
  );

  // Refleja cambios del EventContext SOLO si es mi propio perfil
  useEffect(() => {
    if (!authUid || !isMe) return;
    if (evCtxUser?.id === authUid) {
      setMe((prev) => {
        const next = {
          id: authUid,
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
  }, [
    evCtxUser?.name,
    evCtxUser?.email,
    evCtxUser?.photo,
    authUid,
    isMe,
  ]);

  // Cambiar foto (solo si es mi perfil)
  const onChangePhoto = async () => {
    if (!isMe || !authUid) return;

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permiso requerido",
          "Se necesita permiso para acceder a tus fotos."
        );
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

      const data = await uploadUserPhoto(authUid, res.assets[0].uri);

      setMe((prev) => ({
        ...(prev || {}),
        photo: data.photo,
      }));
      updateUser?.({
        ...(evCtxUser || {}),
        id: authUid,
        photo: data.photo,
      });
      await login({
        user: { ...(authUser || {}), photo: data.photo },
        token,
      });

      setPhotoBust(Date.now());
      Alert.alert("Foto actualizada");
    } catch (e) {
      Alert.alert("Error", "No se pudo subir la foto");
    } finally {
      setPhotoUploading(false);
    }
  };

  // Si no hay usuario logueado
  if (!authUid) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: "#F3F4F6",
        }}
      >
        <Ionicons name="person-circle-outline" size={64} color="#9CA3AF" />
        <Text style={{ fontSize: 18, fontWeight: "600", marginTop: 12, color: "#374151" }}>
          Inicia sesión para ver tu perfil.
        </Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F3F4F6",
        }}
      >
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
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
  const avatarUri = basePhoto
    ? `${basePhoto}?t=${photoBust}`
    : null;

  const eventsData =
    activeTab === "created" ? myEvents : attendingEvents;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F3F4F6" }}>
      {/* Barra superior: volver a mi perfil cuando estoy viendo a otro */}
      {!isMe && authUid && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 2,
          }}
        >
          <TouchableOpacity
            onPress={() => navigation.setParams({ userId: authUid })}
            style={{ flexDirection: "row", alignItems: "center" }}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back-circle-outline" size={22} color="#2563EB" />
            <Text
              style={{
                marginLeft: 6,
                color: "#2563EB",
                fontWeight: "600",
                fontSize: 14,
              }}
            >
              Volver a mi perfil
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Profile Card */}
      <View
        style={{
          margin: 20,
          marginTop: isMe ? 20 : 10,
          padding: 24,
          borderRadius: 24,
          backgroundColor: "#fff",
          alignItems: "center",
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <TouchableOpacity
          onPress={onChangePhoto}
          disabled={photoUploading || !isMe}
          style={{ alignItems: "center" }}
        >
          <Image
            source={
              avatarUri
                ? { uri: avatarUri }
                : require("../../assets/icon.png")
            }
            style={{
              width: 110,
              height: 110,
              borderRadius: 55,
              marginBottom: 8,
              borderWidth: 3,
              borderColor: "#2563EB",
              opacity: isMe ? 1 : 0.9,
            }}
          />
          {photoUploading ? (
            <ActivityIndicator
              style={{
                position: "absolute",
                left: 45,
                top: 45,
              }}
              color="#2563EB"
            />
          ) : null}
        </TouchableOpacity>

        <Text style={{ fontSize: 22, fontWeight: "700", color: "#1F2937", marginTop: 8 }}>
          {displayName}
        </Text>
        <Text style={{ color: "#6B7280", marginTop: 2, fontSize: 15 }}>
          {displayEmail}
        </Text>

        {/* Botones solo para MI perfil */}
        {isMe && (
          <View style={{ flexDirection: "row", marginTop: 18 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate("EditProfile")}
              style={{
                backgroundColor: "#2563EB",
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 12,
                marginRight: 10,
                flexDirection: "row",
                alignItems: "center",
                shadowColor: "#2563EB",
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 2,
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="create-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
                Editar perfil
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate("NotificationSettings")}
              style={{
                backgroundColor: "#F59E42",
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 12,
                flexDirection: "row",
                alignItems: "center",
                shadowColor: "#F59E42",
                shadowOpacity: 0.15,
                shadowRadius: 4,
                elevation: 2,
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="notifications-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>
                Notificaciones
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Events Section */}
      <View style={{ paddingHorizontal: 24, paddingTop: 4 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: "#1F2937" }}>
          {isMe ? "Mis eventos" : "Eventos"}
        </Text>
      </View>

      {/* Tabs */}
      <View
        style={{
          flexDirection: "row",
          marginTop: 12,
          marginHorizontal: 24,
          borderRadius: 999,
          backgroundColor: "#E5E7EB",
          padding: 3,
        }}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
            backgroundColor: activeTab === "created" ? "#2563EB" : "transparent",
          }}
          onPress={() => setActiveTab("created")}
          activeOpacity={0.8}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: activeTab === "created" ? "#fff" : "#374151",
            }}
          >
            Creados
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            paddingVertical: 10,
            borderRadius: 999,
            alignItems: "center",
            backgroundColor: activeTab === "attending" ? "#2563EB" : "transparent",
          }}
          onPress={() => setActiveTab("attending")}
          activeOpacity={0.8}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: activeTab === "attending" ? "#fff" : "#374151",
            }}
          >
            A los que va
          </Text>
        </TouchableOpacity>
      </View>

      {/* Event List */}
      <FlatList
        data={eventsData}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{
          padding: 24,
          paddingTop: 12,
        }}
        ListEmptyComponent={
          <View style={{
            alignItems: "center",
            marginTop: 32,
          }}>
            <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
            <Text style={{ color: "#6B7280", fontSize: 16, marginTop: 8 }}>
              {activeTab === "created"
                ? (isMe
                  ? "No tienes eventos creados."
                  : "No tiene eventos creados.")
                : (isMe
                  ? "No estás apuntado a ningún evento próximo."
                  : "No está apuntado a ningún evento próximo.")}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const timeLabel = getEventTime(item);
          return (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("EventDetail", {
                  event: item,
                })
              }
              activeOpacity={0.85}
              style={{
                flexDirection: "row",
                padding: 16,
                borderRadius: 16,
                backgroundColor: "#fff",
                marginBottom: 16,
                shadowColor: "#000",
                shadowOpacity: 0.06,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
                alignItems: "center",
              }}
            >
              <EventThumbImage
                eventId={item.id}
                serverImage={item.image}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 12,
                  marginRight: 16,
                  backgroundColor: "#E5E7EB",
                }}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontWeight: "700", fontSize: 16, color: "#1F2937" }}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginTop: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={15}
                    color="#2563EB"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ color: "#374151", fontSize: 14 }}>
                    {formatEventDate(item.date)}
                  </Text>
                  {timeLabel ? (
                    <>
                      <Text style={{ color: "#374151", fontSize: 14 }}>
                        {" · "}
                      </Text>
                      <Ionicons
                        name="time-outline"
                        size={15}
                        color="#F59E42"
                        style={{ marginRight: 4 }}
                      />
                      <Text style={{ color: "#374151", fontSize: 14 }}>
                        {timeLabel}
                      </Text>
                    </>
                  ) : null}
                  <Text style={{ color: "#374151", fontSize: 14 }}>
                    {" · "}{item.location}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward-outline" size={22} color="#9CA3AF" />
            </TouchableOpacity>
          );
        }}
      />

      {/* Floating Logout Button */}
      <TouchableOpacity
        onPress={logout}
        activeOpacity={0.85}
        style={{
          position: "absolute",
          right: 24,
          bottom: 32,
          backgroundColor: "#EF4444",
          width: 56,
          height: 56,
          borderRadius: 28,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: "#EF4444",
          shadowOpacity: 0.18,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <Ionicons
          name="log-out-outline"
          size={28}
          color="#fff"
        />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
