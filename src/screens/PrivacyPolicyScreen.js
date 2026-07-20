import React from "react";
import {
  ScrollView,
  Text,
  View,
  StyleSheet,
  StatusBar,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#111827" />
      <LinearGradient
        colors={["#111827", "#4f46e5", "#eef2ff"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={26} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Política de privacidad</Text>
            <Text style={styles.heroSubtitle}>
              Tu privacidad importa. Aquí explicamos de forma clara qué datos usamos y cómo los protegemos.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.updated}>Última actualización: 20/07/2026</Text>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Resumen</Text>
              <Text style={styles.sectionText}>
                Eventos App usa tus datos para gestionar tu cuenta, mostrar eventos relevantes y enviarte recordatorios cuando lo hayas activado. Nunca vendemos tu información personal a terceros.
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>1. Información que tratamos</Text>
              <Text style={styles.sectionText}>
                Recopilamos datos básicos como tu nombre, correo electrónico, foto de perfil, los eventos que creas o sigues, y las preferencias que eliges en la app, como los recordatorios.
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>2. Cómo usamos tus datos</Text>
              <Text style={styles.sectionText}>
                Utilizamos esta información para crear tu cuenta, personalizar tu experiencia, mostrarte eventos relevantes, mantener la seguridad de la app y enviarte notificaciones cuando las hayas activado.
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>3. Compartir datos</Text>
              <Text style={styles.sectionText}>
                Solo compartimos datos con proveedores técnicos que nos ayudan a operar la app, como almacenamiento de imágenes o servicios de notificación, siempre bajo medidas de protección adecuadas.
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>4. Conservación</Text>
              <Text style={styles.sectionText}>
                Mantenemos tus datos mientras tu cuenta siga activa o durante el tiempo necesario para prestar el servicio y cumplir obligaciones legales.
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>5. Tus derechos</Text>
              <Text style={styles.sectionText}>
                Puedes pedir acceso, corrección o eliminación de tus datos en cualquier momento. Si lo deseas, también puedes solicitar información sobre cómo los tratamos.
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>6. Contacto</Text>
              <Text style={styles.sectionText}>
                Si tienes dudas, quieres ejercer algún derecho o simplemente necesitas ayuda, escríbenos a soporte@eventosapp.com.
              </Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#111827",
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 28,
  },
  heroCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
  },
  heroSubtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.86)",
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eef2ff",
    shadowColor: "#111827",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  updated: {
    color: "#6b7280",
    fontSize: 13,
    marginBottom: 12,
  },
  sectionCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eef2ff",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 20,
  },
});