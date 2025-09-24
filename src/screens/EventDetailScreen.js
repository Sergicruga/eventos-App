import React, { useContext, useMemo, useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Button, Alert, ScrollView, TouchableOpacity, Linking, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { EventContext } from './EventContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { API_URL } from '../api/config';
import { AuthContext } from '../context/AuthContext';

export default function EventDetailScreen({ route, navigation }) {
  const { event } = route.params;
  const { events, favorites, toggleFavorite, joinEvent, leaveEvent, deleteEvent } = useContext(EventContext);
  const { user } = useContext(AuthContext); // <- user.id y user.name reales
  const insets = useSafeAreaInsets();

  const current = useMemo(
    () => events.find(e => e.id === event.id) ?? event,
    [events, event.id, event]
  );
  const asistentes = current.asistentes ?? [];
  const isFavorite = favorites.includes(current.id);
  const isJoined = !!(current.asistentes && current.asistentes.includes(user.name));

  const image =
    current.images?.[0]?.url ??
    current.image ??
    current.imageUrl ??
    current.imageUri ??
    null;


  const localEvent = events.find(e => e.id === event.id);
  const showMap = localEvent && localEvent.latitude != null && localEvent.longitude != null;


  const handlePress = () => {
    if (event.type === 'api') {
      let openUrl = event.url;
      try {
        const urlObj = new URL(event.url);
        if (urlObj.hostname.includes('tm7508.net') && urlObj.searchParams.has('u')) {
          openUrl = decodeURIComponent(urlObj.searchParams.get('u'));
        }
      } catch {}
      if (openUrl && openUrl.startsWith('http')) {
        Linking.openURL(openUrl).catch(() => Alert.alert('No se puede abrir el enlace', 'Ha ocurrido un error.'));
      } else {
        Alert.alert('Enlace inválido', 'Este evento no tiene un enlace válido.');
      }
    } else {
      if (!isJoined) {
        joinEvent(event.id);
        Alert.alert('¡Genial!', 'Te has apuntado a este evento.');
      } else {
        leaveEvent(event.id);
        Alert.alert('Cancelado', 'Ya no vas a este evento.');
      }
    }
  };
  const handleDelete = () => {
    Alert.alert('Eliminar evento', '¿Seguro que quieres eliminarlo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: () => {
          deleteEvent(current.id);   // 👈 aquí se llama al contexto
          // Si estabas en el detalle, cierra
          if (navigation?.goBack) navigation.goBack();
        },
      },
    ]);
  };

  // Comentarios
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await fetch(`${API_URL}/events/${event.id}/comments`);
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
      await fetch(`${API_URL}/events/${event.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, comment: newComment }),
      });
      setNewComment("");
      fetchComments();
    } catch {}
    setSending(false);
  };

  useEffect(() => { fetchComments(); }, [event.id]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}  // <-- correcto: prop, no hijo
    >
      <TouchableOpacity
        onPress={() => toggleFavorite(current.id, current)}
        style={{ position: 'absolute', right: 20, top: 18, zIndex: 10 }}
        hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
      >
        <Text style={{ fontSize: 32 }}>{isFavorite ? '⭐' : '☆'}</Text>
      </TouchableOpacity>

     {image ? <Image source={{ uri: image }} style={styles.image} /> : null}
      <Text style={styles.title}>{current.title}</Text>
      <Text style={styles.date}>{current.date} | {current.location}</Text>
      <Text style={styles.description}>{current.description || 'Sin descripción'}</Text>

      {showMap && (
        <View style={{ height: 220, borderRadius: 12, overflow: 'hidden', marginVertical: 12 }}>
          <MapView
            style={{ flex: 1 }}
            initialRegion={{
              latitude: Number(event.latitude),
              longitude: Number(event.longitude),
              latitudeDelta: 0.03,
              longitudeDelta: 0.03,
            }}
          >
            <Marker
              coordinate={{ latitude: Number(event.latitude), longitude: Number(event.longitude) }}
              title={event.title}
              description={event.location}
            />
          </MapView>
        </View>
      )}
      <View style={{ marginTop: 12 }}>
        <Text style={{ fontWeight: 'bold' }}>
          Asistentes ({asistentes.length})
        </Text>
        {asistentes.length > 0 ? (
          <View style={{ marginTop: 6 }}>
            {asistentes.map((nombre, idx) => (
              <Text key={`${current.id}-as-${idx}`}>• {nombre}</Text>
            ))}
          </View>
        ) : (
          <Text style={{ color: '#777', marginTop: 4 }}>Sé el primero en apuntarte</Text>
        )}
      </View>

      <View style={{ marginTop: 20, marginBottom: insets.bottom + 12 }}>
        {current.type === 'api' ? (
          <Button title="Comprar entradas" onPress={handlePress} color="#1976d2" />
        ) : (
          <Button title={isJoined ? 'Ya no voy' : '¡Ya voy!'} onPress={handlePress} color={isJoined ? '#d32f2f' : 'green'} />
        )}
        {event.createdBy === user.name && (
          <View style={{ marginTop: 12 }}>
            <Button
              title="Eliminar evento"
              color="red"
              onPress={() => {
                Alert.alert('Confirmar', '¿Seguro que quieres eliminar este evento?', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Eliminar', style: 'destructive', onPress: () => {
                    deleteEvent(event.id);
                    navigation.goBack();
                  }},
                ]);
              }}            
            />
          </View>
        )}
        {event.createdBy === user.name && (
          <View style={{ marginTop: 12 }}>
            <Button
              title="Editar evento"
              onPress={() => navigation.navigate('EditEvent', { event })}
              color="#1976d2"
            />
          </View>
        )}
      </View>

      {/* Comentarios */}
      <View style={{ marginTop: 24 }}>
        <Text style={{ fontWeight: "bold", fontSize: 16, marginBottom: 8 }}>Comentarios:</Text>
        {loadingComments ? (
          <ActivityIndicator />
        ) : (
          <FlatList
            data={comments}
            keyExtractor={item => String(item.id)}
            renderItem={({ item }) => (
              <View style={styles.commentContainer}>
                <Text style={styles.commentName}>{item.name}</Text>
                <Text>{item.comment}</Text>
                <Text style={styles.commentDate}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
            )}
            ListEmptyComponent={<Text>No hay comentarios.</Text>}
          />
        )}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
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
  image: { width: '100%', height: 220, borderRadius: 12, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 8, paddingRight: 42 },
  date: { color: '#1976d2', marginBottom: 8 },
  description: { fontSize: 16, marginBottom: 10 },
  commentContainer: {
    marginVertical: 4,
    backgroundColor: "#f3f3f3",
    borderRadius: 6,
    padding: 8,
  },
  commentName: {
    fontWeight: "bold",
    marginBottom: 2,
  },
  commentDate: {
    fontSize: 10,
    color: "#888",
    marginTop: 2,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    padding: 8,
    marginRight: 8,
    backgroundColor: "#fff",
  },
});
