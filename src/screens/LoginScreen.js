import React, { useContext, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { AuthContext } from "../context/AuthContext";
import { loginApi, verifyLoginApi } from "../api/auth";

export default function LoginScreen() {
  const { login } = useContext(AuthContext);
  const [email,setEmail] = useState("");
  const [code,setCode] = useState("");
  const [loading,setLoading] = useState(false);
  const [step, setStep] = useState("login"); // "login" or "verify"

  const onSendCode = async () => {
    if (!email) return Alert.alert("Ingresa tu email");
    try {
      setLoading(true);
      await loginApi({ email });
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
      const { user, token } = await verifyLoginApi({ email, code });
      await login({ user, token });
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Iniciar sesión</Text>

      {step === "login" ? (
        <>
          <TextInput style={styles.input} placeholder="Email" autoCapitalize="none"
            keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TouchableOpacity style={styles.btn} onPress={onSendCode} disabled={loading}>
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
          <TouchableOpacity onPress={() => setStep("login")}>
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
  btn:{ backgroundColor:"#111827", padding:14, borderRadius:12, alignItems:"center", marginBottom:12 },
  btnText:{ color:"#fff", fontWeight:"600" },
  link:{ textDecorationLine:"underline", color:"#007AFF", textAlign:"center" },
});
