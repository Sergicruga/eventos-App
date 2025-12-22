import React, { useContext, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native"; // ✅ Linking
import { AuthContext } from "../context/AuthContext";
import { registerApi } from "../api/auth";

export default function RegisterScreen() {
  const { login } = useContext(AuthContext);
  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const PRIVACY_URL = "https://sergicruga.github.io/eventsly-privacy-policy/"; // ✅ pon tu URL real

  const onSubmit = async () => {
    if (!name || !email || !password) return Alert.alert("Completa todos los campos");
    if (!privacyAccepted) return Alert.alert("Debes aceptar la política de privacidad");

    try {
      setLoading(true);

      // ✅ ÚNICO CAMBIO FUNCIONAL: enviar privacyAccepted al server
      const { user, token } = await registerApi({ name, email, password, privacyAccepted });

      await login({ user, token }); // autologin
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const openPrivacy = async () => {
    try {
      const ok = await Linking.canOpenURL(PRIVACY_URL);
      if (ok) await Linking.openURL(PRIVACY_URL);
      else Alert.alert("No se puede abrir la URL de privacidad");
    } catch {
      Alert.alert("No se puede abrir la política de privacidad");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crear cuenta</Text>

      <TextInput style={styles.input} placeholder="Nombre" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {/* ✅ NO CAMBIO TU CHECKBOX, solo añado un link opcional */}
      <TouchableOpacity onPress={() => setPrivacyAccepted(!privacyAccepted)} style={styles.checkboxContainer}>
        <Text>
          {privacyAccepted ? "☑" : "☐"} He leído y acepto la{" "}
          <Text style={styles.link} onPress={openPrivacy}>Política de privacidad</Text>
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btn} onPress={onSubmit} disabled={loading || !privacyAccepted}>
        <Text style={styles.btnText}>{loading ? "Creando..." : "Crear cuenta"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, padding:24, justifyContent:"center" },
  title:{ fontSize:24, fontWeight:"700", marginBottom:24, textAlign:"center" },
  input:{ borderWidth:1, borderColor:"#E5E7EB", borderRadius:10, paddingHorizontal:12, paddingVertical:12, marginBottom:12 },
  checkboxContainer:{ marginBottom:12 },
  link:{ textDecorationLine:"underline" }, // ✅ estilo simple
  btn:{ backgroundColor:"#111827", padding:14, borderRadius:12, alignItems:"center" },
  btnText:{ color:"#fff", fontWeight:"600" },
});
