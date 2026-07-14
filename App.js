import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { EventProvider } from './src/EventContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider from './src/context/AuthContext';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermission } from './src/utils/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function App() {
  useEffect(() => {
    let subscription;

    const initNotifications = async () => {
      try {
        await requestNotificationPermission();
      } catch (error) {
        console.warn('Notification permission init failed:', error);
      }

      try {
        subscription = Notifications.addNotificationReceivedListener(
          (notification) => {
            console.log('Notification received:', notification);
          }
        );
      } catch (error) {
        console.warn('Notification listener setup failed:', error);
      }
    };

    initNotifications();

    return () => {
      subscription?.remove?.();
    };
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