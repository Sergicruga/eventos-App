import React, { useContext, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native"; // ✅ Linking
import { AuthContext } from "../context/AuthContext";
import { registerApi, verifyRegisterApi } from "../api/auth";

export default function RegisterScreen() {
  const { login } = useContext(AuthContext);
  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [code,setCode] = useState("");
  const [loading,setLoading] = useState(false);
  const [step, setStep] = useState("register"); // "register" or "verify"
  const [privacyAccepted, setPrivacyAccepted] = useState(false);

  const PRIVACY_URL = "https://sergicruga.github.io/eventsly-privacy-policy/"; // ✅ pon tu URL real

  const onSendCode = async () => {
    if (!name || !email) return Alert.alert("Completa nombre y email");
    if (!privacyAccepted) return Alert.alert("Debes aceptar la política de privacidad");

    try {
      setLoading(true);
      await registerApi({ name, email, privacyAccepted });
      setStep("verify");
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async () => {
    if (!code) return Alert.alert("Ingresa el código");

    try {
      setLoading(true);
      const { user, token } = await verifyRegisterApi({ email, code, name, privacyAccepted });
      await login({ user, token });
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

      {step === "register" ? (
        <>
          <TextInput style={styles.input} placeholder="Nombre" value={name} onChangeText={setName} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <TouchableOpacity onPress={() => setPrivacyAccepted(!privacyAccepted)} style={styles.checkboxContainer}>
            <Text>
              {privacyAccepted ? "☑" : "☐"} He leído y acepto la{" "}
              <Text style={styles.link} onPress={openPrivacy}>Política de privacidad</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btn} onPress={onSendCode} disabled={loading || !privacyAccepted}>
            <Text style={styles.btnText}>{loading ? "Enviando..." : "Enviar código"}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.subtitle}>Ingresa el código enviado a {email}</Text>
          <TextInput
            style={styles.input}
            placeholder="Código de 6 dígitos"
            keyboardType="numeric"
            value={code}
            onChangeText={setCode}
            maxLength={6}
          />

          <TouchableOpacity style={styles.btn} onPress={onVerify} disabled={loading}>
            <Text style={styles.btnText}>{loading ? "Verificando..." : "Verificar"}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep("register")}>
            <Text style={styles.link}>Cambiar email</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ flex:1, padding:24, justifyContent:"center" },
  title:{ fontSize:24, fontWeight:"700", marginBottom:24, textAlign:"center" },
  subtitle:{ fontSize:16, marginBottom:12, textAlign:"center", color:"#666" },
  input:{ borderWidth:1, borderColor:"#E5E7EB", borderRadius:10, paddingHorizontal:12, paddingVertical:12, marginBottom:12 },
  checkboxContainer:{ marginBottom:12 },
  link:{ textDecorationLine:"underline", color:"#007AFF" },
  btn:{ backgroundColor:"#111827", padding:14, borderRadius:12, alignItems:"center", marginBottom:12 },
  btnText:{ color:"#fff", fontWeight:"600" },
});
