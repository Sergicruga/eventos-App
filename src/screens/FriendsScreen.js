import React, { useState, useContext, useEffect } from 'react';
import { View, TextInput, Button, FlatList, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { EventContext } from '../EventContext';
import { API_URL } from '../api/config';

export default function FriendsScreen() {
  const { user } = useContext(EventContext);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendEvents, setFriendEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Buscar usuarios
  const searchUsers = async () => {
    setLoading(true);
    const res = await fetch(`${API_URL}/users/search?q=${encodeURIComponent(query)}`);
    setResults(await res.json());
    setLoading(false);
  };

  // Obtener amigos
  const fetchFriends = async () => {
    setLoading(true);
    const res = await fetch(`${API_URL}/friends/${user.id}`);
    setFriends(await res.json());
    setLoading(false);
  };

  // Agregar amigo
  const addFriend = async (friendId) => {
    await fetch(`${API_URL}/friends`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, friendId }),
    });
    fetchFriends();
  };

  // Ver eventos de un amigo
  const fetchFriendEvents = async (friendId) => {
    setEventsLoading(true);
    setSelectedFriend(friendId);
    const res = await fetch(`${API_URL}/users/${friendId}/events`);
    setFriendEvents(await res.json());
    setEventsLoading(false);
  };

  useEffect(() => {
    if (user.id) fetchFriends();
  }, [user.id]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Buscar usuarios:</Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Nombre o email"
        style={{ borderWidth: 1, marginBottom: 8, padding: 4, borderRadius: 6 }}
      />
      <Button title="Buscar" onPress={searchUsers} />
      {loading && <ActivityIndicator />}
      <FlatList
        data={results}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 4 }}>
            <Text style={{ flex: 1 }}>{item.name} ({item.email})</Text>
            <TouchableOpacity onPress={() => addFriend(item.id)}>
              <Text style={{ color: 'blue' }}>Agregar</Text>
            </TouchableOpacity>
          </View>
        )}
      />
      <Text style={{ marginTop: 16, fontWeight: 'bold', fontSize: 18 }}>Tus amigos:</Text>
      <FlatList
        data={friends}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => fetchFriendEvents(item.id)}>
            <Text style={{
              paddingVertical: 6,
              fontWeight: selectedFriend === item.id ? 'bold' : 'normal',
              color: selectedFriend === item.id ? '#1976d2' : '#222'
            }}>
              {item.name} ({item.email})
            </Text>
          </TouchableOpacity>
        )}
      />
      {selectedFriend && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Eventos de tu amigo:</Text>
          {eventsLoading ? (
            <ActivityIndicator />
          ) : (
            <FlatList
              data={friendEvents}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <Text style={{ marginVertical: 2 }}>
                  {item.title} - {item.date} - {item.location}
                </Text>
              )}
              ListEmptyComponent={<Text>No hay eventos.</Text>}
            />
          )}
        </View>
      )}
    </View>
  );
}