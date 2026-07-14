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
import { resolveImageUrl } from "../utils/imageSource";
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
    return iso.slice(11, 16);
  }
  return "";
}

/* -----------------------------------------------------------------------------  
  Imagen miniatura evento  
----------------------------------------------------------------------------- */
function EventThumbImage({ eventId, serverImage, style }) {
  const { getEffectiveEventImage, getEventImageSource, overridesReady } =
    useContext(EventContext);

  const [stage, setStage] = React.useState(0);

  const effective =
    getEffectiveEventImage?.(eventId, serverImage) ?? serverImage ?? null;

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
      onError={() => setStage((prev) => (prev < 2 ? prev + 1 : 2))}
    />
  );
}

/* -----------------------------------------------------------------------------  
  Normalizador de eventos  
----------------------------------------------------------------------------- */
function normalizeEvents(rawEvents, getEffectiveEventImage, { onlyUpcoming = true } = {}) {
  const mapped = (rawEvents || []).map((e) => {
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

  const filtered = onlyUpcoming ? mapped.filter((ev) => isUpcoming(ev.date)) : mapped;

  return filtered.sort(
    (a, b) => toLocalMidnightMs(a.date) - toLocalMidnightMs(b.date)
  );
}

/* -----------------------------------------------------------------------------  
  Merge con eventos del EventContext  
----------------------------------------------------------------------------- */
function mergeWithContextEvents(rawEvents, ctxEvents) {
  const ctxMap = Object.fromEntries((ctxEvents || []).map((e) => [String(e.id), e]));

  return (rawEvents || []).map((ev) => {
    const ctx = ctxMap[String(ev.id)];
    if (!ctx) return ev;

    return {
      ...ev,
      date: ctx.date ?? ev.date,
      time_start: ctx.timeStart ?? ev.time_start ?? ev.timeStart ?? null,
      timeStart: ctx.timeStart ?? ev.timeStart ?? null,
      starts_at: ctx.startsAt ?? ev.starts_at ?? ev.startsAt ?? null,
      startsAt: ctx.startsAt ?? ev.startsAt ?? null,
      event_at: ctx.startsAt ?? ctx.event_at ?? ev.event_at ?? null,
    };
  });
}

/* -----------------------------------------------------------------------------  
  COMPONENTE  
----------------------------------------------------------------------------- */
export default function ProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute();

  const { logout, user: authUser, token, login } = useContext(AuthContext);
  const { user: evCtxUser, updateUser, getEffectiveEventImage, events } =
    useContext(EventContext);

  const routeUserIdRaw = route?.params?.userId;
  const authUid = authUser?.id ?? null;
  const viewedUserId = routeUserIdRaw != null ? String(routeUserIdRaw) : authUid;

  const isMe =
    routeUserIdRaw == null ||
    (authUid != null && String(authUid) === String(routeUserIdRaw));

  const [me, setMe] = useState(null);
  const [myEvents, setMyEvents] = useState([]);
  const [attendingEvents, setAttendingEvents] = useState([]);
  const [activeTab, setActiveTab] = useState("created");
  const [loading, setLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoBust, setPhotoBust] = useState(0);

  const absolutePhoto = (photoPath) => resolveImageUrl(photoPath);

  const hydrate = useCallback(async () => {
    if (!viewedUserId) return;

    try {
      setLoading(true);

      const [u, evsCreated, evsAttending] = await Promise.all([
        getUser(viewedUserId),
        getUserCreatedEvents(viewedUserId),
        getUserAttendingEvents(viewedUserId),
      ]);

      setMe((prev) => (prev && prev.id === u.id ? { ...prev, ...u } : u));

      const createdMerged = mergeWithContextEvents(evsCreated, events);
      const attendingMerged = mergeWithContextEvents(evsAttending, events);

      setMyEvents(
        normalizeEvents(createdMerged, getEffectiveEventImage, {
          onlyUpcoming: true,
        })
      );

      setAttendingEvents(
        normalizeEvents(attendingMerged, getEffectiveEventImage, {
          onlyUpcoming: true,
        })
      );

      if (isMe && updateUser) {
        const needEvCtx =
          evCtxUser?.id !== u.id ||
          evCtxUser?.name !== u.name ||
          evCtxUser?.email !== u.email ||
          evCtxUser?.photo !== u.photo;

        if (needEvCtx) {
          updateUser({
            id: u.id,
            name: u.name,
            email: u.email,
            photo: u.photo,
          });
        }
      }

      if (isMe) {
        const needAuth =
          authUser?.id !== u.id ||
          authUser?.name !== u.name ||
          authUser?.email !== u.email ||
          authUser?.photo !== u.photo;

        if (needAuth) {
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
      }
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  }, [
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
  ]);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useFocusEffect(
    useCallback(() => {
      hydrate();
    }, [hydrate])
  );

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
  }, [evCtxUser?.name, evCtxUser?.email, evCtxUser?.photo, authUid, isMe]);

  const onChangePhoto = async () => {
    if (!isMe || !authUid) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

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

  if (!authUid) {
    return (
      <SafeAreaView style={styles.emptyStateScreen}>
        <Ionicons name="person-circle-outline" size={64} color="#9CA3AF" />
        <Text style={styles.emptyStateTitle}>Inicia sesión para ver tu perfil.</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

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
    <SafeAreaView style={styles.safeArea}>
      {!isMe && authUid && (
        <View style={styles.backLinkWrap}>
          <TouchableOpacity
            onPress={() => navigation.setParams({ userId: authUid })}
            style={styles.backLink}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back-circle-outline" size={22} color="#2563EB" />
            <Text style={styles.backLinkText}>Volver a mi perfil</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={eventsData}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerWrap}>
            <View style={styles.heroCard}>
              <LinearGradient
                colors={["#111827", "#4f46e5"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroGradient}
              >
                <View style={styles.heroTopRow}>
                  <View style={styles.heroTitleWrap}>
                    <Text style={styles.heroEyebrow}>{isMe ? "Tu perfil" : "Perfil"}</Text>
                    <Text style={styles.heroName}>{displayName}</Text>
                    <Text style={styles.heroEmail}>{displayEmail}</Text>
                  </View>

                  {isMe ? (
                    <TouchableOpacity onPress={logout} style={styles.iconButton}>
                      <Ionicons name="log-out-outline" size={20} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.avatarBlock}>
                  <TouchableOpacity
                    onPress={onChangePhoto}
                    disabled={photoUploading || !isMe}
                    style={styles.avatarButton}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={avatarUri ? { uri: avatarUri } : require("../../assets/icon.png")}
                      style={styles.avatar}
                    />
                    {photoUploading ? (
                      <ActivityIndicator style={styles.avatarLoader} color="#fff" />
                    ) : null}
                  </TouchableOpacity>
                  <View style={styles.avatarBadge}>
                    <Ionicons name="sparkles-outline" size={14} color="#fff" />
                  </View>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{myEvents.length}</Text>
                    <Text style={styles.statLabel}>Creados</Text>
                  </View>
                  <View style={styles.statCard}>
                    <Text style={styles.statValue}>{attendingEvents.length}</Text>
                    <Text style={styles.statLabel}>Asistirás</Text>
                  </View>
                </View>

                {isMe ? (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate("EditProfile")}
                      style={styles.primaryAction}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="create-outline" size={18} color="#fff" />
                      <Text style={styles.primaryActionText}>Editar perfil</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => navigation.navigate("NotificationSettings")}
                      style={styles.secondaryAction}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="notifications-outline" size={18} color="#fff" />
                      <Text style={styles.secondaryActionText}>Notificaciones</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </LinearGradient>
            </View>

            <View style={styles.tabsWrapper}>
              <Text style={styles.sectionTitle}>{isMe ? "Mis eventos" : "Eventos"}</Text>
              <View style={styles.tabBar}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === "created" && styles.tabButtonActive]}
                  onPress={() => setActiveTab("created")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, activeTab === "created" && styles.tabTextActive]}>
                    Creados
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === "attending" && styles.tabButtonActive]}
                  onPress={() => setActiveTab("attending")}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, activeTab === "attending" && styles.tabTextActive]}>
                    A los que va
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyStateCard}>
            <Ionicons name="calendar-outline" size={40} color="#9CA3AF" />
            <Text style={styles.emptyStateText}>
              {activeTab === "created"
                ? isMe
                  ? "No tienes eventos creados."
                  : "No tiene eventos creados."
                : isMe
                ? "No estás apuntado a ningún evento próximo."
                : "No está apuntado a ningún evento próximo."}
            </Text>
          </View>
        }
        ListFooterComponent={
          isMe ? (
            <View style={styles.footerCard}>
              <TouchableOpacity
                onPress={() => navigation.navigate("PrivacyPolicy")}
                activeOpacity={0.85}
                style={styles.footerRow}
              >
                <View style={styles.footerRowLeft}>
                  <Ionicons name="shield-checkmark-outline" size={20} color="#2563EB" />
                  <Text style={styles.footerText}>Política de privacidad</Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const timeLabel = getEventTime(item);

          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("EventDetail", { event: item })}
              activeOpacity={0.85}
              style={styles.eventCard}
            >
              <EventThumbImage
                eventId={item.id}
                serverImage={item.image}
                style={styles.eventImage}
              />

              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {item.title}
                </Text>

                <View style={styles.eventMetaRow}>
                  <Ionicons name="calendar-outline" size={15} color="#2563EB" />
                  <Text style={styles.eventMetaText}>{formatEventDate(item.date)}</Text>

                  {timeLabel ? (
                    <>
                      <Text style={styles.eventMetaText}> · </Text>
                      <Ionicons name="time-outline" size={15} color="#F59E42" />
                      <Text style={styles.eventMetaText}>{timeLabel}</Text>
                    </>
                  ) : null}
                </View>

                {!!item.location && (
                  <Text style={styles.eventLocation} numberOfLines={1}>
                    {item.location}
                  </Text>
                )}
              </View>

              <Ionicons name="chevron-forward-outline" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  emptyStateScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f3f4f6",
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 12,
    color: "#374151",
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f4f6",
  },
  backLinkWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
  },
  backLinkText: {
    marginLeft: 6,
    color: "#2563EB",
    fontWeight: "600",
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  headerWrap: {
    paddingTop: 8,
  },
  heroCard: {
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#111827",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroGradient: {
    padding: 20,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroTitleWrap: {
    flex: 1,
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
  },
  heroEmail: {
    marginTop: 4,
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  avatarBlock: {
    marginTop: 18,
    alignItems: "center",
    alignSelf: "center",
  },
  avatarButton: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.24)",
    overflow: "hidden",
  },
  avatar: {
    width: 104,
    height: 104,
  },
  avatarLoader: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(17,24,39,0.35)",
  },
  avatarBadge: {
    position: "absolute",
    right: 0,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#f59e0b",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  statsRow: {
    flexDirection: "row",
    marginTop: 18,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  statValue: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  statLabel: {
    marginTop: 2,
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 16,
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 11,
    borderRadius: 12,
  },
  primaryActionText: {
    marginLeft: 6,
    color: "#111827",
    fontWeight: "700",
  },
  secondaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingVertical: 11,
    borderRadius: 12,
  },
  secondaryActionText: {
    marginLeft: 6,
    color: "#fff",
    fontWeight: "700",
  },
  tabsWrapper: {
    marginTop: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#e5e7eb",
    borderRadius: 999,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: "center",
  },
  tabButtonActive: {
    backgroundColor: "#2563EB",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  tabTextActive: {
    color: "#fff",
  },
  emptyStateCard: {
    alignItems: "center",
    marginTop: 22,
    paddingVertical: 24,
    backgroundColor: "#fff",
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  emptyStateText: {
    color: "#6B7280",
    fontSize: 15,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  footerCard: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  footerRowLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  footerText: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  eventImage: {
    width: 72,
    height: 72,
    borderRadius: 12,
    marginRight: 14,
    backgroundColor: "#E5E7EB",
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontWeight: "700",
    fontSize: 15,
    color: "#111827",
  },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    flexWrap: "wrap",
  },
  eventMetaText: {
    color: "#6B7280",
    fontSize: 13,
    marginLeft: 4,
  },
  eventLocation: {
    marginTop: 6,
    color: "#6B7280",
    fontSize: 13,
  },
});