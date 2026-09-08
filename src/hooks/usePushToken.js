import { useState, useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';

const EXPO_PROJECT_ID = 'ec7b6a65-2245-4b94-9f89-7183cae09276';

export function usePushToken() {
  const [expoPushToken, setExpoPushToken] = useState('');

  useEffect(() => {
    (async () => {
      try {
        // Pide permisos
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== 'granted') {
          Alert.alert('Permiso denegado para notificaciones.');
          return;
        }
        // Solo para physical device
        if (Platform.OS === 'android' || Platform.OS === 'ios') {
          const tokenData = await Notifications.getExpoPushTokenAsync({
            projectId: EXPO_PROJECT_ID,
          });
          setExpoPushToken(tokenData.data);
        }
      } catch (e) {
        Alert.alert('Error al obtener token', e.message || String(e));
      }
    })();
  }, []);

  return expoPushToken;
}
