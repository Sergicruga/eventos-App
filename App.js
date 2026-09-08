import React, { useContext, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AppNavigator from './src/navigation/AppNavigator';
import { EventProvider } from './src/EventContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthProvider, { AuthContext } from './src/context/AuthContext';
import * as Notifications from 'expo-notifications';
import {
  registerPushTokenForUser,
  requestNotificationPermission,
} from './src/utils/notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function NotificationBootstrap() {
  const { user } = useContext(AuthContext);

  useEffect(() => {
    let subscription;

    const initNotifications = async () => {
      try {
        if (user?.id) {
          await registerPushTokenForUser(user.id);
        } else {
          await requestNotificationPermission();
        }
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
  }, [user?.id]);

  return null;
}

export default function App() {

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationBootstrap />
        <EventProvider>
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </EventProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
