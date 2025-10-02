// src/screens/EventDetailScreen.js
import React, { useContext, useMemo, useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Button, Alert, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { EventContext } from '../EventContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { API_URL } from '../api/config';
import { AuthContext } from '../context/AuthContext';

const DEFAULT_EVENT_IMAGE = "https://via.placeholder.com/800x450.png?text=Evento"; // PNG seguro
const BACKUP_EVENT_IMAGE  = "https://picsum.photos/800/450";                        // backup aleatorio

export default function EventDetailScreen({ route, navigation }) {
  const { event } = route.params;
  const { events, favorites, toggleFavorite, joinEvent, leaveEvent, deleteEvent } = useContext(EventContext);
  const { user } = useContext(AuthContext);
  const insets = useSafeAreaInsets();

  // usa siempre "current" (el evento actualizado del contexto)
  const current = useMemo(
    () => events.find(e => e.id === event.id) ?? event,
    [events, event.id, event]
  );
  const isFavorite = favorites.includes(current.id);

  // ---------- Imagen con fallback en cadena ----------
  const initialImg = (typeof current?.image === 'string' && current.image.trim() !== '')
    ? current.image
    : DEFAULT_EVENT_IMAGE;

  const [imgUri, setImgUri] = useState(initialImg);
  const [usedBackup, setUsedBackup] = useState(false);
  const [usedAsset, setUsedAsset] = useState(false);

  // Si cambia el evento o su image, resetea el flujo de fallback
  useEffect(() => {
    const startUri = (typeof current?.image === 'string' && current.image.trim() !== '')
      ? current.image
      : DEFAULT_EVENT_IMAGE;
    setImgUri(startUri);
    setUsedBackup(false);
    setUsedAsset(false);
  }, [current?.id, current?.image]);

  // ---------- Asistentes ----------
  const [attendees, setAttendees] = useState([]);
  const [isJoined, setIsJoined] = useState(false);

  useEffect(() => {
    const fetchAttendees = async () => {
      try {
        const res = await fetch(`${API_URL}/events/${current.id}/attendees`);
        if (res.ok) {
          const data = await res.json();
          setAttendees(data);
          setIsJoined(data.some(a => a.id === user.id));
        } else {
          setAttendees([]);
          setIsJoined(false);
        }
      } catch {
        setAttendees([]);
        setIsJoined(false);
      }
    };
    fetchAttendees();
  }, [current.id, user.id]);

  const handleJoinOrLeave = async () => {
    try {
      if (!isJoined) {
        await joinEvent(current.id);
        Alert.alert('¡Genial!', 'Te has apuntado a este evento.');
      } else {
        await leaveEvent(current.id);
        Alert.alert('Cancelado', 'Ya no vas a este evento.');
      }
      const res = await fetch(`${API_URL}/events/${current.id}/attendees`);
      if (res.ok) {
        const data = await res.json();
        setAttendees(data);
        setIsJoined(data.some(a => a.id === user.id));
      }
    } catch {
      Alert.alert('Error', 'No se pudo actualizar tu asistencia.');
    }
  };

  // ---------- Comentarios ----------
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      <TouchableOpacity
        onPress={() => toggleFavorite(current.id, current)}
        style={{ position: 'absolute', right: 20, top: 18, zIndex: 10 }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={{ fontSize: 32 }}>{isFavorite ? '⭐' : '☆'}</Text>
      </TouchableOpacity>

      {/* Imagen SIEMPRE visible con fallback */}
      <View style={styles.headerImageWrap}>
        {usedAsset ? (
          <Image
            source={require("../../assets/iconoApp.png")} // <-- tu asset local
            style={styles.headerImage}
            resizeMode="cover"
          />
        ) : (
          <Image
            source={{ uri: imgUri }}
            style={styles.headerImage}
            resizeMode="cover"
            onError={() => {
              if (!usedBackup) {
                setUsedBackup(true);
                setImgUri(BACKUP_EVENT_IMAGE);   // 2º intento: otra URL
              } else {
                setUsedAsset(true);               // 3º intento: asset local
              }
            }}
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
          <Button
            title={isJoined ? 'Ya no voy' : '¡Ya voy!'}
            onPress={handleJoinOrLeave}
            color={isJoined ? '#d32f2f' : 'green'}
          />
        )}

        {current.createdBy === user.name && (
          <View style={{ marginTop: 12 }}>
            <Button
              title="Eliminar evento"
              color="red"
              onPress={() => {
                Alert.alert('Confirmar', '¿Seguro que quieres eliminar este evento?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Eliminar', style: 'destructive', onPress: () => {
                    deleteEvent(current.id);
                    navigation.goBack();
                  }} ,
                ]);
              }}
            />
          </View>
        )}

        {current.createdBy === user.name && (
          <View style={{ marginTop: 12 }}>
            <Button
              title="Editar evento"
              onPress={() => navigation.navigate('EditEvent', { event: current })}
              color="#1976d2"
            />
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
    height: 200, // asegura espacio constante
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
    marginVertical: 4,
    backgroundColor: '#f3f3f3',
    borderRadius: 6,
    padding: 8,
  },
  commentName: { fontWeight: 'bold', marginBottom: 2 },
  commentDate: { fontSize: 10, color: '#888', marginTop: 2 },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginRight: 8,
    backgroundColor: '#fff',
  },
});
