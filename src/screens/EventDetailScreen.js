import React, { useContext, useMemo, useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Image, StyleSheet, Alert, Linking, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Platform, KeyboardAvoidingView, Dimensions,
} from 'react-native';
import { EventContext } from '../EventContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { API_URL } from '../api/config';
import { AuthContext } from '../context/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { scheduleEventNotification } from '../utils/notifications';

// ✅ NUEVO: helper real para cargar usuario
import { getUser } from '../api/users';
import { EVENT_CATEGORIES, normalizeEventCategory } from '../constants/categories';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  primary: '#3B5BA9',
  secondary: '#6C757D',
  accent: '#63605eff',
  background: '#F8FAFC',
  white: '#fff',
  gray: '#888',
  inputBg: '#F1F5F9',
  border: '#D1D5DB',
  shadow: '#B0BEC5',
  text: '#444',
  error: '#d32f2f',
  success: 'green',
};

function isOwner(ev, user) {
  if (!ev || !user) return false;
  const uid = user?.id != null ? String(user.id) : null;
  const uname = typeof user?.name === 'string' ? user.name.trim().toLowerCase() : null;
  if (ev?.createdById != null && uid && String(ev.createdById) === uid) return true;
  if (ev?.created_by != null && uid && String(ev.created_by) === uid) return true;
  if (typeof ev?.createdBy === 'number' && uid && String(ev.createdBy) === uid) return true;
  if (typeof ev?.createdBy === 'string' && uid) {
    const v = ev.createdBy.trim();
    if (/^\d+$/.test(v) && v === uid) return true;
  }
  if (typeof ev?.createdBy === 'string' && uname) {
    if (ev.createdBy.trim().toLowerCase() === uname) return true;
  }
  return false;
}

// ===== Helpers locales =====
const pickTMImage = (images) => {
  if (!Array.isArray(images) || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0));
  const best = sorted.find(img => img?.ratio === '16_9' && (img?.width ?? 0) >= 1024) || sorted[0];
  const url = best?.url || best?.secure_url || null;
  return url ? url.replace(/^http:\/\//, 'https://') : null;
};

// ✅ ARREGLADO: NO forzar https en local (192.168 / 10.0 / localhost)
const toHttps = (u) => {
  if (!u || typeof u !== 'string') return u;

  const s = u.trim();
  if (!s) return u;

  // local / lan
  if (s.includes('192.168.')) return s;
  if (s.includes('10.0.')) return s;
  if (s.includes('localhost')) return s;
  if (s.includes('127.0.0.1')) return s;

  return s.replace(/^http:\/\//, 'https://');
};

const unwrapRedirect = (s) => {
  try {
    const u = new URL(s);
    const inner = u.searchParams.get('url') || u.searchParams.get('u') || u.searchParams.get('redirect');
    if (inner) return decodeURIComponent(inner);
    return s;
  } catch {
    return s;
  }
};

const sanitizeExternalUrl = (u) => {
  if (!u || typeof u !== 'string') return null;
  let s = u.trim();
  if (s.startsWith('//')) s = 'https:' + s;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s)) s = 'https://' + s;
  s = unwrapRedirect(s);
  return s;
};

const withCacheBust = (url, updatedAt) => {
  if (!url || typeof url !== 'string') return url;
  const ts = updatedAt ? String(updatedAt) : '';
  if (!ts) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('t', ts);
    return u.toString();
  } catch {
    return url + (url.includes('?') ? '&' : '?') + 't=' + ts;
  }
};

const isHttpUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(String(s).trim());
const looksLikeTicketmasterId = (id) => typeof id === 'string' && !/^\d+$/.test(id) && id.length >= 10;

const buildTicketmasterUrl = (id) => {
  if (!looksLikeTicketmasterId(id)) return null;
  return `https://www.ticketmaster.es/event/${encodeURIComponent(id)}`;
};

// ====== utilidades de fecha/hora ======
const getEventDateFromEvent = (ev) => {
  const s =
    ev?.startsAt ?? ev?.starts_at ??
    ev?.event_at ?? ev?.date ?? null;

  if (typeof s === 'string') {
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  if (s instanceof Date) return s.toISOString().slice(0, 10);
  return null;
};

const getEventTimeHHMM = (ev) => {
  const plain = ev?.timeStart ?? ev?.time_start ?? null;
  if (typeof plain === 'string' && /^\d{2}:\d{2}/.test(plain)) return plain.slice(0, 5);

  const s = ev?.startsAt ?? ev?.starts_at ?? ev?.event_at ?? null;
  if (typeof s === 'string') {
    const m = s.match(/T(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
  }
  return null;
};

const formatDateOnlyEs = (dateStr) => {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(dateStr);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const meses = [
    'enero','febrero','marzo','abril','mayo','junio',
    'julio','agosto','septiembre','octubre','noviembre','diciembre'
  ];
  return `${d} de ${meses[mo - 1]} de ${y}`;
};

const formatTimeHHMM = (evOrStr) => {
  if (!evOrStr) return '';
  if (typeof evOrStr === 'string') {
    const m = evOrStr.match(/T(\d{2}):(\d{2})/);
    if (m) return `${m[1]}:${m[2]}`;
    if (/^\d{2}:\d{2}/.test(evOrStr)) return evOrStr.slice(0, 5);
    return '';
  }
  return getEventTimeHHMM(evOrStr) ?? '';
};

// ===== helpers asistentes / fotos =====
const getApiOrigin = () => {
  const s = String(API_URL || '').trim();
  // quita /api o /api/ al final si existe
  return s.replace(/\/api\/?$/i, '');
};

const buildAbsolutePhoto = (photoPath) => {
  if (!photoPath || typeof photoPath !== 'string') return null;
  const trimmed = photoPath.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return toHttps(trimmed);
  }

  const origin = getApiOrigin();
  const p = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${origin}${p}`;
};

const getAttendeeAvatar = (att) => {
  if (!att) return null;

  if (att.photo) {
    const abs = buildAbsolutePhoto(att.photo);
    if (abs && isHttpUrl(abs)) return abs;
  }

  const possibleKeys = [
    'avatar',
    'avatarUrl',
    'avatar_url',
    'profileImage',
    'profile_image',
    'photo_url',
    'image',
    'image_url',
  ];

  for (const key of possibleKeys) {
    const v = att[key];
    if (typeof v === 'string' && v.trim()) {
      const candidate = buildAbsolutePhoto(v.trim()) || v.trim();
      const clean = toHttps(candidate);
      if (isHttpUrl(clean)) return clean;
    }
  }

  return null;
};

const getAttendeeName = (att) => {
  if (!att) return '';
  return (
    att.name ||
    att.fullName ||
    att.username ||
    att.displayName ||
    att.email ||
    ''
  );
};

const getInitials = (raw) => {
  if (!raw || typeof raw !== 'string') return '?';
  const s = raw.trim();
  if (!s) return '?';

  const base = s.includes('@') ? s.split('@')[0] : s;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const getAttendeeUserId = (att) => {
  if (!att) return null;
  if (att.userId != null) return att.userId;
  if (att.user_id != null) return att.user_id;
  if (att.uid != null) return att.uid;
  if (att.id != null) return att.id;
  return null;
};

// ===== helpers comentarios (userId + nombre + avatar) =====
const getCommentUserId = (c) => {
  if (!c) return null;

  const direct =
    c.userId ??
    c.user_id ??
    c.authorId ??
    c.createdById ??
    c.created_by ??
    c.fk_user ??
    c.fk_id_user ??
    null;

  if (direct != null) return direct;

  // caso: "user" como número/string
  if (typeof c.user === 'number') return c.user;
  if (typeof c.user === 'string' && c.user.trim()) return c.user.trim();

  // caso: user objeto
  if (c.user && typeof c.user === 'object' && c.user.id != null) return c.user.id;

  return null;
};

const getCommentName = (c) => {
  if (!c) return 'Usuario';
  return (
    c.name ??
    c.userName ??
    c.username ??
    c.authorName ??
    c.user?.name ??
    c.user?.username ??
    'Usuario'
  );
};

const getCommentAvatar = (c) => {
  if (!c) return null;

  const raw =
    c.photo ??
    c.avatar ??
    c.avatarUrl ??
    c.avatar_url ??
    c.photoUrl ??
    c.photo_url ??
    c.user?.photo ??
    c.user?.avatar ??
    c.user?.photoUrl ??
    null;

  if (typeof raw === 'string' && raw.trim()) {
    const abs = buildAbsolutePhoto(raw.trim()) || raw.trim();
    const clean = toHttps(abs);
    return isHttpUrl(clean) ? clean : null;
  }
  return null;
};

const formatCommentDate = (raw) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
};

/**
 * Get the display name for an event's category
 */
const getCategoryDisplayName = (event) => {
  if (!event) return 'Otro';
  const category = normalizeEventCategory(event.type || event.type_evento || event.category);
  return category?.name || 'Otro';
};

// ==============================================

export default function EventDetailScreen({ route, navigation }) {
  const { event } = route.params;
  const {
    events, favorites, toggleFavorite, joinEvent, leaveEvent, deleteEvent,
    getEventImageSource, getEffectiveEventImage
  } = useContext(EventContext);
  const { user } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const [imgFallbackLocal, setImgFallbackLocal] = useState(false);

  const matchedFromList = useMemo(() => {
    if (!Array.isArray(events) || !event) return null;

    const id = event?.id != null ? String(event.id) : null;
    const ext =
      (event?.externalId != null && String(event.externalId)) ||
      (event?.tm_id != null && String(event.tm_id)) ||
      (event?.sourceId != null && String(event.sourceId)) ||
      null;

    if (id) {
      const byId = events.find(e => String(e.id) === id);
      if (byId) return byId;
    }
    if (ext) {
      const byExt = events.find(e =>
        String(e.externalId ?? e.tm_id ?? e.sourceId ?? '') === ext
      );
      if (byExt) return byExt;
    }
    const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
    const title = norm(event.title);
    const date = (event.date || '').slice(0, 10);
    if (title && date) {
      const byTD = events.find(e =>
        norm(e.title) === title && String(e.date || '').slice(0, 10) === date
      );
      if (byTD) return byTD;
    }
    return null;
  }, [events, event]);

  const current = useMemo(
    () => matchedFromList ?? event,
    [matchedFromList, event]
  );

  const isFavorite = favorites.includes(current.id);
  const amOwner = isOwner(current, user);

  const effectiveImage = getEffectiveEventImage(current.id, current.image);
  const ticketmasterImage = useMemo(() => pickTMImage(current?.images), [current?.images]);
  const updatedAt =
    current?.updatedAt ||
    current?.imageUpdatedAt ||
    current?.updated_at ||
    current?.image_updated_at ||
    '';

  const finalImageUrl = useMemo(() => {
    const base = ticketmasterImage || effectiveImage || null;
    if (!base) return null;
    const https = /^https?:\/\//i.test(base) ? toHttps(base) : base;
    return withCacheBust(https, updatedAt);
  }, [ticketmasterImage, effectiveImage, updatedAt]);

  const imageSource = useMemo(() => {
    if (finalImageUrl && /^https?:\/\//i.test(finalImageUrl)) {
      return { uri: finalImageUrl };
    }
    return getEventImageSource(finalImageUrl);
  }, [finalImageUrl, getEventImageSource]);

  const computedBuyUrl = useMemo(() => {
    const pick = (obj) => {
      if (!obj) return null;
      const keys = [
        'url','purchaseUrl','purchase_url','buyUrl','buy_url',
        'website','externalUrl','external_url','ticketUrl','saleUrl','link',
        'sourceUrl','source_url',
      ];
      for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === 'string' && v.trim()) {
          const clean = toHttps(sanitizeExternalUrl(v));
          if (isHttpUrl(clean)) return clean;
        }
      }
      const a = obj?._embedded?.attractions?.[0]?.url;
      const v = obj?._embedded?.venues?.[0]?.url;
      for (const raw of [a, v]) {
        const clean = toHttps(sanitizeExternalUrl(raw));
        if (isHttpUrl(clean)) return clean;
      }
      return null;
    };

    const fromParam = toHttps(sanitizeExternalUrl(route?.params?.buyUrl));
    if (isHttpUrl(fromParam)) return fromParam;

    const fromRouteEvent = pick(route?.params?.event);
    if (fromRouteEvent) return fromRouteEvent;

    const fromCurrent = pick(current);
    if (fromCurrent) return fromCurrent;

    const idCandidate = current?.externalId || current?.tm_id || current?.id;
    const tmFallback = buildTicketmasterUrl(idCandidate);
    return tmFallback || null;
  }, [route?.params?.buyUrl, route?.params?.event, current]);

  const buyUrl = computedBuyUrl;

  useEffect(() => {
    const idCandidate = current?.externalId || current?.tm_id || current?.id;
    console.log('=== [EventDetail] Debug ===');
    console.log('route.params.buyUrl:', route?.params?.buyUrl);
    console.log('current.id/title:', current?.id, current?.title);
    console.log('idCandidate (TM fallback):', idCandidate);
    console.log('=> buyUrl:', buyUrl);
  }, [route?.params?.buyUrl, current?.id, buyUrl]);

  // ----- Asistentes -----
  const [attendees, setAttendees] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchAttendees = async () => {
      if (!current?.id) return;
      try {
        const res = await fetch(`${API_URL}/events/${current.id}/attendees`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setAttendees(Array.isArray(data) ? data : []);
          const uid = user?.id != null ? String(user.id) : null;
          setIsJoined(uid ? data.some(a => String(getAttendeeUserId(a)) === uid) : false);
        } else {
          if (cancelled) return;
          setAttendees([]);
          setIsJoined(false);
        }
      } catch {
        if (cancelled) return;
        setAttendees([]);
        setIsJoined(false);
      }
    };
    fetchAttendees();
    return () => { cancelled = true; };
  }, [current.id, user?.id]);

  const handleJoinOrLeave = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Inicia sesión', 'Necesitas iniciar sesión para apuntarte.');
      return;
    }
    if (joining) return;
    setJoining(true);

    const uidStr = String(user.id);

    if (!isJoined) {
      setIsJoined(true);
      setAttendees(prev => [...prev, { id: user.id, name: user.name, photo: user.photo }]);
      try {
        await joinEvent(current.id);
        await scheduleEventNotification(current);
      } catch (e) {
        setIsJoined(false);
        setAttendees(prev => prev.filter(a => String(getAttendeeUserId(a)) !== uidStr));
        Alert.alert('Error', e?.message || 'No se pudo apuntar. Inténtalo de nuevo.');
      }
    } else {
      setIsJoined(false);
      setAttendees(prev => prev.filter(a => String(getAttendeeUserId(a)) !== uidStr));
      try {
        await leaveEvent(current.id);
      } catch (e) {
        setIsJoined(true);
        setAttendees(prev => [...prev, { id: user.id, name: user.name, photo: user.photo }]);
        Alert.alert('Error', e?.message || 'No se pudo cancelar. Inténtalo de nuevo.');
      }
    }

    try {
      const res = await fetch(`${API_URL}/events/${current.id}/attendees`);
      if (res.ok) {
        const data = await res.json();
        setAttendees(Array.isArray(data) ? data : []);
        const uid = String(user.id);
        setIsJoined(data.some(a => String(getAttendeeUserId(a)) === uid));
      }
    } catch {}

    setJoining(false);
  }, [user, joining, isJoined, current.id, joinEvent, leaveEvent]);

  // ----- Comentarios -----
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sending, setSending] = useState(false);

  // ✅ NUEVO: cache para no pedir el mismo user mil veces
  const commentUsersCacheRef = useRef({}); // { [userId]: userObject }

  // ✅ NUEVO: hidratar comentarios con user (name/photo)
  const hydrateCommentsWithUsers = useCallback(async (rawComments) => {
    const arr = Array.isArray(rawComments) ? rawComments : [];

    const ids = [...new Set(arr.map(getCommentUserId).filter(Boolean).map(id => String(id)))];

    console.log('COMMENTS total:', arr.length);
    if (arr[0]) console.log('COMMENTS RAW[0]:', arr[0]);
    console.log('COMMENTS extracted ids:', ids);

    if (ids.length === 0) return arr;

    const cache = commentUsersCacheRef.current || {};

    await Promise.allSettled(
      ids.map(async (id) => {
        if (cache[id]) return;
        try {
          const u = await getUser(id);
          if (u) cache[id] = u;
        } catch {}
      })
    );

    commentUsersCacheRef.current = cache;

    const merged = arr.map((c) => {
      if (c?.user && typeof c.user === 'object') return c;
      const uid = getCommentUserId(c);
      const u = uid != null ? cache[String(uid)] : null;
      return u ? { ...c, user: u } : c;
    });

    if (merged[0]) console.log('COMMENTS hydrated[0]:', merged[0]);

    return merged;
  }, []);

  const fetchComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`${API_URL}/events/${current.id}/comments`);
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      const merged = await hydrateCommentsWithUsers(arr);
      setComments(merged);
    } catch {
      setComments([]);
    }
    setLoadingComments(false);
  }, [current.id, hydrateCommentsWithUsers]);

  const sendComment = useCallback(async () => {
    if (!newComment.trim()) return;
    setSending(true);
    try {
      await fetch(`${API_URL}/events/${current.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, comment: newComment }),
      });
      setNewComment('');
      fetchComments();
    } catch {}
    setSending(false);
  }, [current.id, user?.id, newComment, fetchComments]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const eventDateObj = useMemo(() => getEventDateFromEvent(current), [current]);
  const dateLabel = useMemo(() => {
    return formatDateOnlyEs(eventDateObj) || (current?.date
      ? new Date(current.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : '');
  }, [eventDateObj, current?.date]);

  const startTimeLabel = useMemo(() => {
    const t1 =
      (typeof current?.timeStart === 'string' && current.timeStart.trim()) ||
      (typeof current?.time_start === 'string' && current.time_start.trim()) ||
      null;
    if (t1 && /^\d{2}:\d{2}$/.test(t1)) return t1.slice(0, 5);

    const s1 =
      (typeof current?.startsAt === 'string' && current.startsAt) ||
      (typeof current?.starts_at === 'string' && current.starts_at) ||
      null;
    if (s1) {
      const hhmm = formatTimeHHMM(s1);
      if (hhmm) return hhmm;
    }

    const rp = route?.params?.event ?? {};
    const t2 =
      (typeof rp.timeStart === 'string' && rp.timeStart.trim()) ||
      (typeof rp.time_start === 'string' && rp.time_start.trim()) ||
      null;
    if (t2 && /^\d{2}:\d{2}$/.test(t2)) return t2.slice(0, 5);

    const s2 =
      (typeof rp.startsAt === 'string' && rp.startsAt) ||
      (typeof rp.starts_at === 'string' && rp.starts_at) ||
      null;
    if (s2) {
      const hhmm = formatTimeHHMM(s2);
      if (hhmm) return hhmm;
    }

    if (typeof current?.date === 'string' && current.date.length > 10) {
      const hhmm = formatTimeHHMM(current.date);
      if (hhmm) return hhmm;
    }
    return null;
  }, [current?.timeStart, current?.time_start, current?.startsAt, current?.starts_at, current?.date, route?.params?.event]);

  // ✅ navegación a perfil desde comentario
  const goToUserProfile = useCallback((userId) => {
    if (!userId) return;
    navigation.navigate('Tabs', {
      screen: 'Profile',
      params: { userId: String(userId) },
    });
  }, [navigation]);

  return (
    <LinearGradient
      colors={['#f8fafc', '#e0e7ef', '#f5e8e4']}
      style={{ flex: 1 }}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Imagen principal */}
          <View style={styles.headerImageOuter}>
            <View style={styles.headerImageClip}>
              {imgFallbackLocal ? (
                <Image
                  source={require('../../assets/iconoApp.png')}
                  style={styles.headerImage}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={imageSource}
                  style={styles.headerImage}
                  resizeMode="cover"
                  onError={() => setImgFallbackLocal(true)}
                />
              )}
            </View>

            <TouchableOpacity
              onPress={() => toggleFavorite(current.id, current)}
              style={styles.favoriteBtn}
              hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              accessibilityLabel={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              activeOpacity={0.85}
            >
              <Ionicons
                name={isFavorite ? 'star' : 'star-outline'}
                size={28}
                color={COLORS.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Info principal */}
          <View style={styles.card}>
            <Text style={styles.title}>{current.title}</Text>

            <View style={styles.row}>
              <Ionicons name="calendar-outline" size={18} color={COLORS.secondary} style={{ marginRight: 6 }} />
              <Text style={styles.date}>{dateLabel}</Text>
            </View>

            {startTimeLabel && (
              <View style={styles.row}>
                <Ionicons name="time-outline" size={18} color={COLORS.secondary} style={{ marginRight: 6 }} />
                <Text style={styles.date}>{startTimeLabel} h</Text>
              </View>
            )}

            <View style={styles.row}>
              <Ionicons name="location-outline" size={18} color={COLORS.secondary} style={{ marginRight: 6 }} />
              <Text style={styles.location}>{current.location}</Text>
            </View>
            <Text style={styles.description}>{current.description || 'Sin descripción'}</Text>

            {current.type && (
              <View style={styles.typeTag}>
                <Ionicons name="pricetag-outline" size={16} color={COLORS.primary} />
                <Text style={styles.typeTagText}>{getCategoryDisplayName(current)}</Text>
              </View>
            )}
            {current?.source && (
              <View style={[styles.typeTag, { marginTop: 6 }]}>
                <Ionicons name="link-outline" size={16} color={COLORS.primary} />
                <Text style={styles.typeTagText}>{current.source}</Text>
              </View>
            )}
          </View>

          {/* Mapa */}
          {current.latitude != null && current.longitude != null && (
            <View style={styles.mapWrap}>
              <MapView
                style={{ flex: 1 }}
                initialRegion={{
                  latitude: Number(current.latitude),
                  longitude: Number(current.longitude),
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                }}
                scrollEnabled={false}
                zoomEnabled={false}
                pitchEnabled={false}
                rotateEnabled={false}
              >
                <Marker
                  coordinate={{ latitude: Number(current.latitude), longitude: Number(current.longitude) }}
                  title={current.title}
                  description={
                    startTimeLabel
                      ? `${current.location} • ${startTimeLabel} h`
                      : current.location
                  }
                  pinColor={COLORS.primary}
                />
              </MapView>
            </View>
          )}

          {/* Asistentes */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="people-outline" size={18} color={COLORS.primary} /> Asistentes ({attendees.length})
            </Text>

            {attendees.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.attendeeAvatarList}
                style={{ marginTop: 6 }}
              >
                {attendees.map((a) => {
                  const avatar = getAttendeeAvatar(a);
                  const name = getAttendeeName(a);
                  const initials = getInitials(name);
                  const targetUserId = getAttendeeUserId(a);

                  return (
                    <TouchableOpacity
                      key={a.id}
                      style={styles.attendeeAvatarWrap}
                      activeOpacity={0.8}
                      onPress={() =>
                        targetUserId &&
                        navigation.navigate('Tabs', {
                          screen: 'Profile',
                          params: { userId: String(targetUserId) },
                        })
                      }
                    >
                      {avatar ? (
                        <Image
                          source={{ uri: avatar }}
                          style={styles.attendeeAvatarImg}
                        />
                      ) : (
                        <View style={styles.attendeeAvatarFallback}>
                          <Text style={styles.attendeeAvatarInitials}>{initials}</Text>
                        </View>
                      )}
                      <Text
                        style={styles.attendeeAvatarName}
                        numberOfLines={1}
                      >
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={{ color: COLORS.gray, marginTop: 4 }}>Sé el primero en apuntarte</Text>
            )}
          </View>

          {/* Botones */}
          <View style={styles.actionBtnContainer}>
            <TouchableOpacity
              onPress={handleJoinOrLeave}
              disabled={joining}
              activeOpacity={0.85}
              style={[styles.primaryBtn, joining && { opacity: 0.7 }]}
              accessibilityLabel={isJoined ? 'Cancelar asistencia' : 'Apuntarse al evento'}
            >
              {joining ? (
                <ActivityIndicator color={COLORS.white} style={{ marginRight: 8 }} />
              ) : (
                <Ionicons
                  name={isJoined ? 'close-circle-outline' : 'checkmark-circle-outline'}
                  size={20}
                  color={COLORS.white}
                  style={{ marginRight: 8 }}
                />
              )}
              <Text style={styles.primaryBtnText}>{isJoined ? 'Ya no voy' : '¡Ya voy!'}</Text>
            </TouchableOpacity>

            {buyUrl && (
              <TouchableOpacity
                onPress={async () => {
                  try {
                    const supported = await Linking.canOpenURL(buyUrl);
                    if (supported) {
                      await Linking.openURL(buyUrl);
                    } else {
                      Alert.alert('No se pudo abrir el enlace', buyUrl);
                    }
                  } catch (e) {
                    Alert.alert('Enlace no válido', String(e?.message || e));
                  }
                }}
                activeOpacity={0.85}
                style={[styles.primaryBtn, { backgroundColor: COLORS.accent }]}
                accessibilityLabel="Comprar entradas"
              >
                <Ionicons name="ticket-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                <Text style={styles.primaryBtnText}>Comprar entradas</Text>
              </TouchableOpacity>
            )}

            {amOwner && (
              <>
                <TouchableOpacity
                  onPress={() => navigation.navigate('EditEvent', { event: current })}
                  activeOpacity={0.85}
                  style={[styles.primaryBtn, { backgroundColor: COLORS.secondary }]}
                >
                  <Ionicons name="create-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                  <Text style={styles.primaryBtnText}>Editar evento</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    Alert.alert('Confirmar', '¿Seguro que quieres eliminar este evento?', [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Eliminar',
                        style: 'destructive',
                        onPress: async () => {
                          await deleteEvent(current.id);
                          navigation.goBack();
                        },
                      },
                    ]);
                  }}
                  activeOpacity={0.85}
                  style={[styles.primaryBtn, { backgroundColor: COLORS.error }]}
                >
                  <Ionicons name="trash-outline" size={20} color={COLORS.white} style={{ marginRight: 8 }} />
                  <Text style={styles.primaryBtnText}>Eliminar evento</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Comentarios */}
          <View style={[styles.card, { marginTop: 28 }]}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.primary} /> Comentarios
            </Text>

            {loadingComments ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 12 }} />
            ) : comments.length > 0 ? (
              comments.map(item => {
                const cid = item?.id ?? `${getCommentUserId(item) ?? 'u'}-${item?.created_at ?? Math.random()}`;
                const userId = getCommentUserId(item);
                const name = getCommentName(item);
                const avatar = getCommentAvatar(item);
                const initials = getInitials(name);
                const date = formatCommentDate(item?.created_at);

                // log temporal (si quieres, luego lo quitamos)
                console.log('COMMENT photo raw:', item?.photo);
                if (avatar) console.log('AVATAR final uri:', avatar);

                return (
                  <View key={cid} style={styles.commentRow}>
                    <TouchableOpacity
                      style={styles.commentAvatarWrap}
                      activeOpacity={0.8}
                      disabled={!userId}
                      onPress={() => goToUserProfile(userId)}
                    >
                      {avatar ? (
                        <Image
                          source={{ uri: avatar }}
                          style={styles.commentAvatarImg}
                          onError={(e) => console.log('AVATAR ERROR:', avatar, e?.nativeEvent)}
                        />
                      ) : (
                        <View style={styles.commentAvatarFallback}>
                          <Text style={styles.commentAvatarInitials}>{initials}</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    <View style={{ flex: 1 }}>
                      <View style={styles.commentHeaderLine}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={!userId}
                          onPress={() => goToUserProfile(userId)}
                        >
                          <Text style={styles.commentName}>{name}</Text>
                        </TouchableOpacity>
                        <Text style={styles.commentDate}>{date}</Text>
                      </View>

                      <Text style={styles.commentText}>{item?.comment}</Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={{ color: COLORS.gray, marginVertical: 8 }}>No hay comentarios.</Text>
            )}

            <View style={styles.commentInputRow}>
              <TextInput
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Escribe un comentario..."
                style={styles.commentInput}
                editable={!sending}
                placeholderTextColor={COLORS.gray}
                selectionColor={COLORS.primary}
              />
              <TouchableOpacity
                onPress={sendComment}
                disabled={sending || !newComment.trim()}
                style={[styles.sendBtn, (sending || !newComment.trim()) && { opacity: 0.5 }]}
                accessibilityLabel="Enviar comentario"
              >
                <Ionicons name="send" size={20} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const IMG_RADIUS = 18;
const IMG_WIDTH = SCREEN_WIDTH * 0.92;
const IMG_HEIGHT = Math.round((IMG_WIDTH * 9) / 16);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 0, backgroundColor: 'transparent' },
  headerImageOuter: {
    width: '92%',
    alignSelf: 'center',
    marginTop: 32,
    marginBottom: 16,
    borderRadius: IMG_RADIUS,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  headerImageClip: {
    width: '100%',
    height: IMG_HEIGHT,
    borderRadius: IMG_RADIUS,
    overflow: 'hidden',
    backgroundColor: COLORS.inputBg,
  },
  headerImage: { width: '100%', height: '100%' },
  favoriteBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 6,
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.16,
        shadowRadius: 6,
      },
    }),
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 18,
    marginHorizontal: '4%',
    marginBottom: 16,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  date: { color: COLORS.secondary, fontSize: 16, fontWeight: '500' },
  location: { color: COLORS.secondary, fontSize: 16, flex: 1, flexWrap: 'wrap' },
  description: { fontSize: 16, color: COLORS.text, marginTop: 10, marginBottom: 6 },
  typeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  typeTagText: { color: COLORS.primary, fontWeight: '600', marginLeft: 6, fontSize: 14 },
  mapWrap: {
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginHorizontal: '4%',
    marginBottom: 18,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: { fontWeight: 'bold', fontSize: 18, color: COLORS.primary, marginBottom: 6 },
  attendeeText: { color: COLORS.text, fontSize: 15, marginVertical: 1, marginLeft: 2 },
  attendeeAvatarList: {
    paddingVertical: 4,
  },
  attendeeAvatarWrap: {
    width: 64,
    marginRight: 10,
    alignItems: 'center',
  },
  attendeeAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.inputBg,
  },
  attendeeAvatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendeeAvatarInitials: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  attendeeAvatarName: {
    marginTop: 4,
    fontSize: 11,
    color: COLORS.text,
    textAlign: 'center',
  },
  actionBtnContainer: {
    width: '92%',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
    width: '100%',
  },
  primaryBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 16 },

  // ✅ Comentarios: layout con avatar
  commentRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 6,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 10,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  commentAvatarWrap: {
    width: 42,
    height: 42,
  },
  commentAvatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.white,
  },
  commentAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarInitials: {
    fontWeight: '800',
    color: COLORS.primary,
  },
  commentHeaderLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  commentName: { fontWeight: 'bold', color: COLORS.primary },
  commentText: { color: COLORS.text, fontSize: 15 },
  commentDate: { fontSize: 10, color: COLORS.gray, marginLeft: 10 },

  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  commentInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    backgroundColor: 'transparent',
    color: COLORS.text,
  },
  sendBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 10,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
});
