import React, { useContext, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { AuthContext } from "../context/AuthContext";
import { loginApi } from "../api/auth";

export default function LoginScreen() {
  const { login } = useContext(AuthContext);
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);

  const onSubmit = async () => {
    if (!email || !password) return Alert.alert("Completa todos los campos");
    try {
      setLoading(true);
      const { user, token } = await loginApi({ email, password });
      await login({ user, token }); // → AppNavigator te lleva al Home automáticamente
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Iniciar sesión</Text>
      <TextInput style={styles.input} placeholder="Email" autoCapitalize="none"
        keyboardType="email-address" value={email} onChangeText={setEmail} />
      <TextInput style={styles.input} placeholder="Contraseña" secureTextEntry
        value={password} onChangeText={setPassword} />
      <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={loading}>
        <Text style={styles.btnText}>{loading ? "Entrando..." : "Entrar"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, padding:24, justifyContent:"center" },
  title:{ fontSize:24, fontWeight:"700", marginBottom:24, textAlign:"center" },
  input:{ borderWidth:1, borderColor:"#E5E7EB", borderRadius:10, paddingHorizontal:12, paddingVertical:12, marginBottom:12 },
  btn:{ backgroundColor:"#111827", padding:14, borderRadius:12, alignItems:"center" },
  btnText:{ color:"#fff", fontWeight:"600" },
});
