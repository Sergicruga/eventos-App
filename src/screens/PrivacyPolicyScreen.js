import React from "react";
import { ScrollView, Text, View, StyleSheet, Platform } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
  primary: '#3B5BA9',
  secondary: '#6C757D',
  accent: '#F5CBA7',
  background: '#F8FAFC',
  white: '#fff',
  gray: '#888',
  border: '#D1D5DB',
  shadow: '#B0BEC5',
  text: '#444',
};

export default function PrivacyPolicyScreen() {
  return (
    <LinearGradient
      colors={[COLORS.background, '#e0e7ef', '#f5e8e4']}
      style={{ flex: 1 }}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Ionicons name="shield-checkmark" size={32} color={COLORS.primary} style={{ marginRight: 10 }} />
            <Text style={styles.title}>Política de Privacidad</Text>
          </View>
          <Text style={styles.updated}>Última actualización: 08/01/2026</Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Responsable del Tratamiento</Text>
            <Text style={styles.sectionText}>EventosApp (SergiCruga)</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Datos que Recopilamos</Text>
            <Text style={styles.sectionText}>
              • Correo electrónico y nombre de usuario {'\n'}
              • Ubicación del evento (solo si la introduces) {'\n'}
              • Fotografías subidas por el usuario {'\n'}
              • Analítica y errores (Firebase, Sentry) {'\n'}
              • Token de notificaciones push
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Finalidad del Tratamiento</Text>
            <Text style={styles.sectionText}>
              Utilizamos tus datos para gestionar tu cuenta, crear y mostrar eventos, mejorar la seguridad, enviar notificaciones y analizar el funcionamiento de la app.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Conservación de los Datos</Text>
            <Text style={styles.sectionText}>
              Conservamos tus datos mientras tu cuenta esté activa o hasta que solicites su eliminación.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>5. Derechos del Usuario</Text>
            <Text style={styles.sectionText}>
              Puedes acceder, rectificar o eliminar tus datos en cualquier momento. También puedes oponerte al tratamiento o solicitar la portabilidad de tus datos.
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>6. Contacto</Text>
            <Text style={styles.sectionText}>
              Si tienes dudas o deseas ejercer tus derechos, contacta con nosotros en:{'\n'}
              <Text style={styles.email}>soporte@tudominio.com</Text>
            </Text>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'transparent',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 22,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 8,
    marginTop: 32,
    marginBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 1.1,
    fontFamily: Platform.OS === 'ios' ? 'AvenirNext-DemiBold' : 'sans-serif-medium',
    textShadowColor: COLORS.shadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  updated: {
    color: COLORS.secondary,
    fontSize: 14,
    marginBottom: 18,
    marginLeft: 2,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontWeight: '700',
    fontSize: 17,
    color: COLORS.primary,
    marginBottom: 4,
  },
  sectionText: {
    fontSize: 15.5,
    color: COLORS.text,
    lineHeight: 22,
    marginLeft: 2,
  },
  email: {
    color: COLORS.accent,
    fontWeight: 'bold',
    fontSize: 15.5,
  },
});
