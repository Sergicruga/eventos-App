import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { EventProvider } from './src/EventContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider from './src/context/AuthContext';
import { requestNotificationPermission } from './src/utils/notifications';
import * as Notifications from 'expo-notifications';

export default function App() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, // show as banner
      shouldShowList: true,   // show in notification center
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });
    return () => subscription.remove();
  }, []);
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
