// src/screens/EditProfileScreen.js
import React, { useContext, useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from "react-native";
import { AuthContext } from "../context/AuthContext";
import { EventContext } from "../EventContext";
import { updateProfile, changePassword } from "../api/users";

export default function EditProfileScreen({ navigation }) {
  const auth = useContext(AuthContext);
  const { user: userFromEventCtx, updateUser } = useContext(EventContext);
  const uid = auth?.user?.id;

  const [name, setName] = useState(userFromEventCtx?.name || auth?.user?.name || "");
  const [email, setEmail] = useState(userFromEventCtx?.email || auth?.user?.email || "");
  const [saving, setSaving] = useState(false);

  // password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);

  const saveProfile = async () => {
    if (!uid) return;
    setSaving(true);
    try {
      const u = await updateProfile(uid, { name, email });
      // sincroniza ambos contextos
      updateUser?.({ id: u.id, name: u.name, email: u.email, photo: u.photo });
      // también AuthContext (persistir cambios del usuario logueado)
      const { login } = auth;
      await login({ user: { ...auth.user, name: u.name, email: u.email }, token: auth.token });
      Alert.alert("Perfil actualizado");
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async () => {
    if (!uid) return;
    if (!currentPassword || !newPassword) return Alert.alert("Rellena ambas contraseñas");
    setChangingPwd(true);
    try {
      await changePassword(uid, currentPassword, newPassword);
      Alert.alert("Contraseña actualizada");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setChangingPwd(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24 }}>
      <Text style={{ fontSize:18, fontWeight:'700', marginBottom:12 }}>Editar perfil</Text>

      <Text style={{ marginBottom:6 }}>Nombre</Text>
      <TextInput
        value={name} onChangeText={setName}
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12, marginBottom:12 }}
      />

      <Text style={{ marginBottom:6 }}>Email</Text>
      <TextInput
        value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12, marginBottom:16 }}
      />

      <TouchableOpacity onPress={saveProfile} disabled={saving}
        style={{ backgroundColor:'#111827', padding:14, borderRadius:12, alignItems:'center' }}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'600' }}>Guardar</Text>}
      </TouchableOpacity>

      <View style={{ height:24 }} />

      <Text style={{ fontSize:16, fontWeight:'700', marginBottom:12 }}>Cambiar contraseña</Text>
      <TextInput
        placeholder="Contraseña actual" secureTextEntry value={currentPassword} onChangeText={setCurrentPassword}
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12, marginBottom:12 }}
      />
      <TextInput
        placeholder="Nueva contraseña" secureTextEntry value={newPassword} onChangeText={setNewPassword}
        style={{ borderWidth:1, borderColor:'#ddd', borderRadius:10, padding:12, marginBottom:16 }}
      />
      <TouchableOpacity onPress={savePassword} disabled={changingPwd}
        style={{ backgroundColor:'#2563eb', padding:14, borderRadius:12, alignItems:'center' }}>
        {changingPwd ? <ActivityIndicator color="#fff" /> : <Text style={{ color:'#fff', fontWeight:'600' }}>Actualizar contraseña</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}
