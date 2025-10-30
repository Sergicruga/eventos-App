import React, { useContext, useEffect, useState, useCallback } from "react";
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
  Keyboard,
  RefreshControl,
  Pressable,
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
  const navigation = useNavigation();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [friendEvents, setFriendEvents] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [friendActionVisible, setFriendActionVisible] = useState(false);
  const [currentActionFriend, setCurrentActionFriend] = useState(null);
  const [friendRequests, setFriendRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch friends and requests on mount / when user available
  useEffect(() => {
    if (!user?.id) return;
    fetchFriends();
    fetchFriendRequests();
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchFriends(), fetchFriendRequests()]);
    setRefreshing(false);
  }, [user?.id]);

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
    if (!user?.id) return;
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
    if (!user?.id) return;
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
    try {
      await fetch(`${API_URL}/friend-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: user.id, receiverId: friendId }),
      });
      setQuery("");
      setSearchResults([]);
      Keyboard.dismiss();
      alert("¡Solicitud enviada!");
    } catch (e) {
      alert("No se pudo enviar la solicitud.");
    }
  };

  // Accept friend request
  const acceptRequest = async (requestId) => {
    try {
      await fetch(`${API_URL}/friend-requests/${requestId}/accept`, { method: "POST" });
      fetchFriendRequests();
      fetchFriends();
    } catch { /* ignore */ }
  };

  // Reject friend request
  const rejectRequest = async (requestId) => {
    try {
      await fetch(`${API_URL}/friend-requests/${requestId}`, { method: "DELETE" });
      fetchFriendRequests();
    } catch { /* ignore */ }
  };

  // Remove friend
  const removeFriend = async (friendId) => {
    try {
      await fetch(`${API_URL}/users/${user.id}/friends/${friendId}`, {
        method: "DELETE",
      });
      fetchFriends();
      if (selectedFriend && selectedFriend.id === friendId) {
        setModalVisible(false);
        setSelectedFriend(null);
        setFriendEvents([]);
      }
    } catch { /* ignore */ }
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

  // Open action sheet for friend (View events / Remove)
  const openFriendActions = (friend) => {
    setCurrentActionFriend(friend);
    setFriendActionVisible(true);
  };

  const handleActionViewEvents = () => {
    if (currentActionFriend) viewFriendEvents(currentActionFriend);
    setFriendActionVisible(false);
  };
  const handleActionRemove = async () => {
    if (currentActionFriend) await removeFriend(currentActionFriend.id);
    setFriendActionVisible(false);
  };

  // Render friend card
  const renderFriend = ({ item }) => (
    <TouchableOpacity
      style={styles.friendCard}
      onPress={() => viewFriendEvents(item)}
      activeOpacity={0.88}
    >
      <Image
        source={{ uri: getAvatarUrl(item.photo) }}
        style={styles.avatar}
      />
      <View style={{ flex: 1, paddingRight: 8, marginLeft: 12 }}>
        <Text style={styles.friendName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.friendEmail} numberOfLines={1}>{item.email}</Text>
      </View>
      <Pressable onPress={() => openFriendActions(item)} style={styles.iconBtn}>
        <Ionicons name="ellipsis-vertical" size={20} color="#444" />
      </Pressable>
    </TouchableOpacity>
  );

  // Render search result card
  const renderSearchResult = ({ item }) => (
    <View style={styles.friendCard}>
      <Image
        source={{ uri: getAvatarUrl(item.photo) }}
        style={styles.avatar}
      />
      <View style={{ flex: 1, paddingRight: 8, marginLeft: 12 }}>
        <Text style={styles.friendName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.friendEmail} numberOfLines={1}>{item.email}</Text>
      </View>
      <TouchableOpacity
        onPress={() => sendFriendRequest(item.id)}
        style={styles.addBtn}
      >
        <Ionicons name="person-add" size={20} color="#1976d2" />
      </TouchableOpacity>
    </View>
  );

  // Render friend request card (compact)
  const renderFriendRequest = ({ item }) => (
    <View style={[styles.requestCard]}>
      <Image source={{ uri: getAvatarUrl(item.photo) }} style={styles.requestAvatar} />
      <View style={{ flex: 1, paddingHorizontal: 8, marginLeft: 4 }}>
        <Text style={styles.friendName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.friendEmail} numberOfLines={1}>{item.email}</Text>
      </View>
      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#c8e6c9' }]} onPress={() => acceptRequest(item.id)}>
        <Ionicons name="checkmark" size={18} color="#2e7d32" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.smallBtn, { backgroundColor: '#ffcdd2', marginLeft: 8 }]} onPress={() => rejectRequest(item.id)}>
        <Ionicons name="close" size={18} color="#c62828" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.topCard}>
        <View>
          <Text style={styles.header}>Amigos</Text>
          <Text style={styles.subtitle}>Conéctate y descubre eventos con tus amigos</Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#9e9e9e" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por nombre o email..."
          value={query}
          onChangeText={searchUsers}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); Keyboard.dismiss(); }} style={{ padding: 8 }}>
            <Ionicons name="close-circle" size={18} color="#bdbdbd" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading && <ActivityIndicator style={{ marginVertical: 12 }} />}

      {query.length > 0 && (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderSearchResult}
          style={{ marginHorizontal: 16, marginTop: 8 }}
          ListEmptyComponent={
            !loading && (
              <Text style={{ textAlign: "center", color: "#888", padding: 12 }}>
                No se encontraron usuarios.
              </Text>
            )
          }
        />
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.subHeader}>Solicitudes</Text>
        <Text style={styles.badge}>{friendRequests.length}</Text>
      </View>

      {loadingRequests ? (
        <ActivityIndicator style={{ marginVertical: 12 }} />
      ) : friendRequests.length > 0 ? (
        <FlatList
          data={friendRequests}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderFriendRequest}
          style={{ marginHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 6 }}
        />
      ) : (
        <Text style={styles.emptyText}>No tienes solicitudes pendientes.</Text>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.subHeader}>Tus amigos</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={18} color="#1976d2" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={friends}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderFriend}
        ListEmptyComponent={
          !loading && (
            <Text style={[styles.emptyText, { marginTop: 20 }]}>
              No tienes amigos aún. Busca y añade algunos.
            </Text>
          )
        }
        style={{ marginHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 8 }}
      />

      {/* Friend's events modal */}
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
                <View style={styles.profileCard}>
                  <Image source={{ uri: getAvatarUrl(selectedFriend.photo) }} style={styles.avatarLarge} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.profileName}>{selectedFriend.name}</Text>
                    <Text style={styles.profileEmail}>{selectedFriend.email}</Text>
                  </View>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={22} color="#777" />
                  </TouchableOpacity>
                </View>

                <View style={styles.divider} />

                <Text style={styles.modalHeader}>Eventos</Text>
                {eventsLoading ? (
                  <ActivityIndicator style={{ marginVertical: 20 }} />
                ) : friendEvents.length > 0 ? (
                  <FlatList
                    data={friendEvents}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.eventCard}
                        activeOpacity={0.9}
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
                        <View style={{ flex: 1, paddingLeft: 8 }}>
                          <Text style={styles.eventTitle} numberOfLines={1}>{item.title}</Text>
                          <Text style={styles.eventDate}>{item.event_at}</Text>
                          <Text style={styles.eventLocation} numberOfLines={1}>{item.location}</Text>
                        </View>
                      </TouchableOpacity>
                    )}
                  />
                ) : (
                  <Text style={{ color: "#888", textAlign: "center", marginVertical: 18 }}>No hay eventos.</Text>
                )}
              </>
            ) : (
              <ActivityIndicator style={{ marginVertical: 40 }} />
            )}
          </View>
        </View>
      </Modal>

      {/* Friend actions modal (compact) */}
      <Modal visible={friendActionVisible} transparent animationType="fade" onRequestClose={() => setFriendActionVisible(false)}>
        <Pressable style={styles.actionOverlay} onPress={() => setFriendActionVisible(false)}>
          <View style={styles.actionSheet}>
            <Text style={styles.actionTitle}>{currentActionFriend?.name}</Text>
            <TouchableOpacity style={styles.actionRow} onPress={handleActionViewEvents}>
              <Ionicons name="calendar" size={18} color="#1976d2" style={{ marginRight: 12 }} />
              <Text style={styles.actionText}>Ver eventos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionRow} onPress={handleActionRemove}>
              <Ionicons name="person-remove" size={18} color="#d32f2f" style={{ marginRight: 12 }} />
              <Text style={[styles.actionText, { color: '#d32f2f' }]}>Eliminar amigo</Text>
            </TouchableOpacity>
            <Button title="Cerrar" onPress={() => setFriendActionVisible(false)} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f6f8fb" },
  topCard: {
    paddingHorizontal: 16,
    paddingTop: 26,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    fontSize: 26,
    fontWeight: "700",
    color: "#0d47a1",
  },
  subtitle: {
    color: "#607d8b",
    marginTop: 4,
    fontSize: 13,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  subHeader: {
    fontSize: 16,
    fontWeight: "700",
    color: "#37474f",
  },
  sectionHeader: {
    marginTop: 18,
    marginHorizontal: 16,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    backgroundColor: "#e3f2fd",
    color: "#1976d2",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    fontWeight: "700",
    fontSize: 13,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 999,
    backgroundColor: "transparent",
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginVertical: 8,
    padding: 12,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#e0e0e0",
  },
  avatarLarge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "#e0e0e0",
  },
  friendName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#212121",
  },
  friendEmail: {
    fontSize: 13,
    color: "#757575",
    marginTop: 2,
  },
  addBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#e3f2fd",
  },
  removeBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "#ffebee",
    marginLeft: 8,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  requestCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    marginVertical: 8,
    padding: 10,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  requestAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e0e0e0",
  },
  smallBtn: {
    padding: 8,
    borderRadius: 8,
  },
  emptyText: {
    textAlign: "center",
    color: "#9e9e9e",
    marginHorizontal: 16,
    paddingVertical: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "92%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    maxHeight: "84%",
  },
  modalHeader: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
    color: "#0d47a1",
    textAlign: "center",
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  profileName: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0d47a1",
  },
  profileEmail: {
    fontSize: 13,
    color: "#616161",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#eceff1",
    marginVertical: 10,
    marginHorizontal: -14,
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fafafa",
    marginVertical: 8,
    padding: 8,
    borderRadius: 10,
  },
  eventImage: {
    width: 72,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#e0e0e0",
  },
  eventTitle: {
    fontWeight: "700",
    fontSize: 15,
    color: "#212121",
  },
  eventDate: {
    fontSize: 13,
    color: "#1976d2",
    marginTop: 4,
  },
  eventLocation: {
    fontSize: 12,
    color: "#757575",
    marginTop: 2,
  },
  actionOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },
  actionSheet: {
    backgroundColor: "#fff",
    padding: 16,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  actionTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 12,
    color: "#37474f",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  actionText: {
    fontSize: 15,
    color: "#37474f",
  },
});