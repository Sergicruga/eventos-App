import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { EventProvider } from './src/screens/EventContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider from './src/context/AuthContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <EventProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </EventProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
