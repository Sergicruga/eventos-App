import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Button,
  Keyboard
} from "react-native";
import { API_URL } from '../api/config';
import { AuthContext } from "../context/AuthContext";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native"; // <-- Only this is needed

const AVATAR_PLACEHOLDER = "https://placehold.co/80x80?text=User";



// Helper to get full avatar URL
const getAvatarUrl = (photo) =>
  photo ? API_URL + photo : AVATAR_PLACEHOLDER;

export default function FriendsScreen() {
  const { user } = useContext(AuthContext);
  const navigation = useNavigation(); // <-- move here!
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendEvents, setFriendEvents] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);

  // Friend requests
  const [friendRequests, setFriendRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // Fetch friends and requests on mount
  useEffect(() => {
    fetchFriends();
    fetchFriendRequests();
  }, [user.id]);

  // Search users
  const searchUsers = async (text) => {
    setQuery(text);
    if (text.trim().length === 0) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/users/search?q=${encodeURIComponent(text)}&userId=${user.id}`
      );
      const data = await res.json();
      setSearchResults(data);
    } catch {
      setSearchResults([]);
    }
    setLoading(false);
  };

  // Fetch friends
  const fetchFriends = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/users/${user.id}/friends`);
      const data = await res.json();
      setFriends(data);
    } catch {
      setFriends([]);
    }
    setLoading(false);
  };

  // Fetch friend requests
  const fetchFriendRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await fetch(`${API_URL}/users/${user.id}/friend-requests`);
      const data = await res.json();
      setFriendRequests(data);
    } catch {
      setFriendRequests([]);
    }
    setLoadingRequests(false);
  };

  // Send friend request
  const sendFriendRequest = async (friendId) => {
    await fetch(`${API_URL}/friend-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId: user.id, receiverId: friendId }),
    });
    setQuery("");
    setSearchResults([]);
    Keyboard.dismiss();
    alert("¡Solicitud enviada!");
  };

  // Accept friend request
  const acceptRequest = async (requestId) => {
    await fetch(`${API_URL}/friend-requests/${requestId}/accept`, { method: "POST" });
    fetchFriendRequests();
    fetchFriends();
  };

  // Reject friend request
  const rejectRequest = async (requestId) => {
    await fetch(`${API_URL}/friend-requests/${requestId}`, { method: "DELETE" });
    fetchFriendRequests();
  };

  // Remove friend
  const removeFriend = async (friendId) => {
    await fetch(`${API_URL}/users/${user.id}/friends/${friendId}`, {
      method: "DELETE",
    });
    fetchFriends();
    if (selectedFriend && selectedFriend.id === friendId) {
      setModalVisible(false);
      setSelectedFriend(null);
      setFriendEvents([]);
    }
  };

  // View friend's events
  const viewFriendEvents = async (friend) => {
    setSelectedFriend(friend);
    setModalVisible(true);
    setEventsLoading(true);
    try {
      const res = await fetch(`${API_URL}/users/${friend.id}/events`);
      const data = await res.json();
      setFriendEvents(data);
    } catch {
      setFriendEvents([]);
    }
    setEventsLoading(false);
  };

  // Render friend card
  const renderFriend = ({ item }) => (
    <TouchableOpacity
      style={styles.friendCard}
      onPress={() => viewFriendEvents(item)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: getAvatarUrl(item.photo) }}
        style={styles.avatar}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.friendName}>{item.name}</Text>
        <Text style={styles.friendEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity
        onPress={() => removeFriend(item.id)}
        style={styles.removeBtn}
      >
        <Ionicons name="person-remove" size={22} color="#d32f2f" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  // Render search result card
  const renderSearchResult = ({ item }) => (
    <View style={styles.friendCard}>
      <Image
        source={{ uri: getAvatarUrl(item.photo) }}
        style={styles.avatar}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.friendName}>{item.name}</Text>
        <Text style={styles.friendEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity
        onPress={() => sendFriendRequest(item.id)}
        style={styles.addBtn}
      >
        <Ionicons name="person-add" size={22} color="#1976d2" />
      </TouchableOpacity>
    </View>
  );

  // Render friend request card
  const renderFriendRequest = ({ item }) => (
    <View style={styles.friendCard}>
      <Image
        source={{ uri: getAvatarUrl(item.photo) }}
        style={styles.avatar}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.friendName}>{item.name}</Text>
        <Text style={styles.friendEmail}>{item.email}</Text>
      </View>
      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: "#c8e6c9" }]}
        onPress={() => acceptRequest(item.id)}
      >
        <Ionicons name="checkmark" size={22} color="#388e3c" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.removeBtn, { backgroundColor: "#ffcdd2" }]}
        onPress={() => rejectRequest(item.id)}
      >
        <Ionicons name="close" size={22} color="#d32f2f" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Amigos</Text>
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar usuarios por nombre o email..."
        value={query}
        onChangeText={searchUsers}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {loading && <ActivityIndicator style={{ marginVertical: 10 }} />}
      {query.length > 0 && (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSearchResult}
          style={{ marginBottom: 10 }}
          ListEmptyComponent={
            !loading && (
              <Text style={{ textAlign: "center", color: "#888" }}>
                No se encontraron usuarios.
              </Text>
            )
          }
        />
      )}

      <Text style={styles.subHeader}>Solicitudes de amistad</Text>
      {loadingRequests ? (
        <ActivityIndicator style={{ marginVertical: 10 }} />
      ) : friendRequests.length > 0 ? (
        <FlatList
          data={friendRequests}
          keyExtractor={item => String(item.id)}
          renderItem={renderFriendRequest}
        />
      ) : (
        <Text style={{ textAlign: "center", color: "#888", marginBottom: 10 }}>
          No tienes solicitudes pendientes.
        </Text>
      )}

      <Text style={styles.subHeader}>Tus amigos</Text>
      <FlatList
        data={friends}
        keyExtractor={item => item.id.toString()}
        renderItem={renderFriend} // <-- use renderFriend, not FriendItem
        ListEmptyComponent={
          !loading && (
            <Text style={{ textAlign: "center", color: "#888", marginTop: 20 }}>
              No tienes amigos aún. ¡Busca y añade algunos!
            </Text>
          )
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Modal for friend's events */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
        transparent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedFriend ? (
              <>
                {/* Profile Card */}
                <View style={styles.profileCard}>
                  <Image
                    source={{ uri: getAvatarUrl(selectedFriend.photo) }}
                    style={styles.avatarLarge}
                  />
                  <View style={{ marginLeft: 16 }}>
                    <Text style={styles.profileName}>{selectedFriend.name}</Text>
                    <Text style={styles.profileEmail}>{selectedFriend.email}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <Text style={styles.modalHeader}>Eventos de {selectedFriend.name}</Text>
                {eventsLoading ? (
                  <ActivityIndicator style={{ marginVertical: 20 }} />
                ) : friendEvents.length > 0 ? (
                  <FlatList
                    data={friendEvents}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.eventCard}
                        activeOpacity={0.85}
                        onPress={() => {
                          setModalVisible(false);
                          navigation.navigate("EventDetail", { event: item });
                        }}
                      >
                        <Image
                          source={{
                            uri:
                              item.image && item.image.trim() !== ""
                                ? item.image
                                : "https://placehold.co/600x300?text=Evento",
                          }}
                          style={styles.eventImage}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.eventTitle}>{item.title}</Text>
                          <Text style={styles.eventDate}>{item.event_at}</Text>
                          <Text style={styles.eventLocation}>{item.location}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <Text style={{ color: "#888", textAlign: "center" }}>
                        No hay eventos.
                      </Text>
                    }
                  />
                ) : (
                  <Text style={{ color: "#888", textAlign: "center" }}>
                    No hay eventos.
                  </Text>
                )}
                <Button title="Cerrar" onPress={() => setModalVisible(false)} />
              </>
            ) : (
              <ActivityIndicator style={{ marginVertical: 40 }} />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f9fa", padding: 0 },
  header: {
    fontSize: 28,
    fontWeight: "bold",
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 20,
    color: "#1976d2",
  },
  subHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 6,
    marginLeft: 20,
    color: "#333",
  },
  searchInput: {
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fff",
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginLeft: 20, // align with header
    marginRight: 16,
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: "#e0e0e0",
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 8,
    backgroundColor: "#e0e0e0",
  },
  friendName: {
    fontSize: 17,
    fontWeight: "bold",
    color: "#222",
  },
  friendEmail: {
    fontSize: 13,
    color: "#888",
  },
  addBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#e3f2fd",
    marginLeft: 8,
  },
  removeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#ffebee",
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "90%",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
    maxHeight: "80%",
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 18,
    marginBottom: 8,
    color: "#1976d2",
    textAlign: "center",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    marginTop: 4,
  },
  profileName: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#1976d2",
  },
  profileEmail: {
    fontSize: 15,
    color: "#555",
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: "#e0e0e0",
    marginVertical: 10,
    marginHorizontal: -18,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    marginVertical: 6,
    padding: 8,
    borderRadius: 10,
  },
  eventImage: {
    width: 60,
    height: 40,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: "#e0e0e0",
  },
  eventTitle: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#222",
  },
  eventDate: {
    fontSize: 13,
    color: "#1976d2",
  },
  eventLocation: {
    fontSize: 12,
    color: "#888",
  },
});