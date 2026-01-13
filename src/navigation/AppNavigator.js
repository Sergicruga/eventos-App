// src/navigation/AppNavigator.js
import React, { useContext } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { AuthContext } from "../context/AuthContext";

// PÚBLICAS
import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/LoginScreen";
import RegisterScreen from "../screens/RegisterScreen";

// PRIVADAS
import TabNavigator from "./TabNavigator"; // <-- tu TabNavigator existente
import EventDetail from "../screens/EventDetailScreen";
import CreateEventScreen from "../screens/CreateEventScreen";
import EditProfileScreen from "../screens/EditProfileScreen";
import EditEventScreen from "../screens/EditEventScreen";
import NotificationSettingsScreen from '../screens/NotificationSettingsScreen';
import PrivacyPolicyScreen from "../screens/PrivacyPolicyScreen";
import CategoryEventsScreen from "../screens/CategoryEventsScreen";

// importa aquí cualquier otra pantalla "modal" o de detalle que abras desde tabs

const Stack = createNativeStackNavigator();

function PublicStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ title: "Iniciar sesión" }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ title: "Crear cuenta" }} />
    </Stack.Navigator>
  );
}

function PrivateStack() {
  return (
    <Stack.Navigator>
      {/* Primer screen: tus pestañas */}
      <Stack.Screen
        name="Tabs"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      {/* Pantallas por encima del Tab, accesibles desde cualquier pestaña */}
      <Stack.Screen
        name="EventDetail"
        component={EventDetail}
        options={{ title: "Detalle" }}
      />
      <Stack.Screen
        name="CategoryEvents"
        component={CategoryEventsScreen}
        options={{ title: "Eventos" }}
      />
      <Stack.Screen
        name="CreateEventScreen"
        component={CreateEventScreen}
        options={{ title: "Nuevo evento" }}
      />
      <Stack.Screen 
        name="EditProfile" 
        component={EditProfileScreen} 
        options={{ title: "Editar perfil" }} 
      />
      <Stack.Screen
        name="EditEvent"
        component={EditEventScreen}
        options={{ presentation: 'modal', headerShown: true, title: 'Editar evento' }}
      />
      
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: "Política de privacidad" }}
      />
      {/* añade aquí más screens de detalle si las tienes */}
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { token, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <View style={{ flex:1, justifyContent:"center", alignItems:"center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return token ? <PrivateStack /> : <PublicStack />;
}
