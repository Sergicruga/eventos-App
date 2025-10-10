import React, { useContext, useMemo, useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Button, Alert, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { EventContext } from '../EventContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { API_URL } from '../api/config';
import { AuthContext } from '../context/AuthContext';

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

export default function EventDetailScreen({ route, navigation }) {
  const { event } = route.params;
  const {
    events, favorites, toggleFavorite, joinEvent, leaveEvent, deleteEvent,
    getEventImageSource, getEffectiveEventImage
  } = useContext(EventContext);
  const { user } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const [imgFallbackLocal, setImgFallbackLocal] = useState(false);

  const current = useMemo(
    () => events.find(e => String(e.id) === String(event.id)) ?? event,
    [events, event.id, event]
  );
  const isFavorite = favorites.includes(current.id);
  const amOwner = isOwner(current, user);

  // Imagen efectiva (override > server)
  const effectiveImage = getEffectiveEventImage(current.id, current.image);

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
          setIsJoined(uid ? data.some(a => String(a.id) === uid) : false);
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

  const handleJoinOrLeave = async () => {
    if (!user?.id) {
      Alert.alert('Inicia sesión', 'Necesitas iniciar sesión para apuntarte.');
      return;
    }
    if (joining) return;
    setJoining(true);

    const uidStr = String(user.id);

    // Optimista
    if (!isJoined) {
      setIsJoined(true);
      setAttendees(prev => [...prev, { id: user.id, name: user.name }]);
      try {
        await joinEvent(current.id);
        Alert.alert('¡Genial!', 'Te has apuntado a este evento.');
      } catch (e) {
        // revertir
        setIsJoined(false);
        setAttendees(prev => prev.filter(a => String(a.id) !== uidStr));
        Alert.alert('Error', e?.message || 'No se pudo apuntar. Inténtalo de nuevo.');
      }
    } else {
      setIsJoined(false);
      setAttendees(prev => prev.filter(a => String(a.id) !== uidStr));
      try {
        await leaveEvent(current.id);
        Alert.alert('Cancelado', 'Ya no vas a este evento.');
      } catch (e) {
        // revertir
        setIsJoined(true);
        setAttendees(prev => [...prev, { id: user.id, name: user.name }]);
        Alert.alert('Error', e?.message || 'No se pudo cancelar. Inténtalo de nuevo.');
      }
    }

    // Refrescar lista real desde backend (mejor estado final)
    try {
      const res = await fetch(`${API_URL}/events/${current.id}/attendees`);
      if (res.ok) {
        const data = await res.json();
        setAttendees(Array.isArray(data) ? data : []);
        const uid = String(user.id);
        setIsJoined(data.some(a => String(a.id) === uid));
      }
    } catch {}

    setJoining(false);
  };

  // ----- Comentarios -----
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`${API_URL}/events/${current.id}/comments`);
      setComments(await res.json());
    } catch {
      setComments([]);
    }
    setLoadingComments(false);
  };

  const sendComment = async () => {
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
  };

  useEffect(() => { fetchComments(); }, [current.id]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
      <TouchableOpacity
        onPress={() => toggleFavorite(current.id, current)}
        style={{ position: 'absolute', right: 20, top: 18, zIndex: 10 }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={{ fontSize: 32 }}>{isFavorite ? '⭐' : '☆'}</Text>
      </TouchableOpacity>

      {/* Imagen */}
      <View style={styles.headerImageWrap}>
        {imgFallbackLocal ? (
          <Image
            source={require('../../assets/iconoApp.png')}
            style={styles.headerImage}
            resizeMode="cover"
          />
        ) : (
          <Image
            source={getEventImageSource(effectiveImage)}
            style={styles.headerImage}
            resizeMode="cover"
            onError={() => setImgFallbackLocal(true)}
          />
        )}
      </View>

      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.date}>{current.date} | {current.location}</Text>
      <Text style={styles.description}>{current.description || 'Sin descripción'}</Text>

      {current.latitude != null && current.longitude != null && (
        <View style={{ height: 220, borderRadius: 12, overflow: 'hidden', marginVertical: 12 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={{
              latitude: Number(current.latitude),
              longitude: Number(current.longitude),
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
          >
            <Marker
              coordinate={{ latitude: Number(current.latitude), longitude: Number(current.longitude) }}
              title={current.title}
              description={current.location}
            />
          </MapView>
        </View>
      )}

      <View style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: 'bold' }}>
          Asistentes ({attendees.length})
        </Text>
        {attendees.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            {attendees.map(a => (
              <Text key={a.id}>• {a.name}</Text>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#777', marginTop: 4 }}>Sé el primero en apuntarte</Text>
        )}
      </View>

      <View style={{ marginTop: 20, marginBottom: insets.bottom + 12 }}>
        {current.type === 'api' ? (
          <Button title="Comprar entradas" onPress={() => {}} color="#1976d2" />
        ) : (
          // Botón personalizado: se pone ROJO cuando estás apuntado
          <TouchableOpacity
            onPress={handleJoinOrLeave}
            disabled={joining}
            activeOpacity={0.8}
            style={[
              styles.attendBtn,
              isJoined ? styles.attendBtnJoined : styles.attendBtnIdle,
              joining && { opacity: 0.7 }
            ]}
          >
            {joining ? (
              <ActivityIndicator />
            ) : (
              <Text style={styles.attendBtnText}>
                {isJoined ? 'Ya no voy' : '¡Ya voy!'}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {amOwner && (
          <View style={{ marginTop: 12 }}>
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
              activeOpacity={0.8}
              style={[styles.attendBtn, styles.attendBtnJoined]}
            >
              <Text style={styles.attendBtnText}>Eliminar evento</Text>
            </TouchableOpacity>
          </View>
        )}

        {amOwner && (
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('EditEvent', { event: current })}
              activeOpacity={0.8}
              style={[styles.attendBtn, styles.attendBtnEdit]}
            >
              <Text style={styles.attendBtnText}>Editar evento</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Comentarios */}
      <View style={{ marginTop: 24 }}>
        <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>Comentarios:</Text>
        {loadingComments ? (
          <ActivityIndicator />
        ) : comments.length > 0 ? (
          comments.map(item => (
            <View key={item.id} style={styles.commentContainer}>
              <Text style={styles.commentName}>{item.name}</Text>
              <Text>{item.comment}</Text>
              <Text style={styles.commentDate}>{new Date(item.created_at).toLocaleString()}</Text>
            </View>
          ))
        ) : (
          <Text>No hay comentarios.</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <TextInput
            value={newComment}
            onChangeText={setNewComment}
            placeholder="Escribe un comentario..."
            style={styles.commentInput}
            editable={!sending}
          />
          <Button title="Enviar" onPress={sendComment} disabled={sending || !newComment.trim()} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  headerImageWrap: {
    width: '100%',
    height: 200,
    backgroundColor: '#eef2f7',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  headerImage: { width: '100%', height: '100%' },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, paddingRight: 42 },
  date: { color: '#1976d2', marginBottom: 8 },
  description: { fontSize: 16, marginBottom: 10 },
  commentContainer: {
    marginVertical: 4, backgroundColor: '#f3f3f3', borderRadius: 6, padding: 8,
  },
  commentName: { fontWeight: 'bold', marginBottom: 2 },
  commentDate: { fontSize: 10, color: '#888', marginTop: 2 },
  commentInput: {
    flex: 1, borderWidth: 1, borderRadius: 6, padding: 8, marginRight: 8, backgroundColor: '#fff',
  },
  // ---- Botón asistir personalizado ----
  attendBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  attendBtnIdle: {
    backgroundColor: 'green',
  },
  attendBtnJoined: {
    backgroundColor: '#d32f2f', // ROJO
  },
  attendBtnEdit: {
    backgroundColor: '#1976d2', // Azul
  },
  attendBtnText: {
    fontWeight: '700',
    color: '#fff',
  },
});
