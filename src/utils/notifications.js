import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { API_URL } from '../config';

const EXPO_PROJECT_ID = 'ec7b6a65-2245-4b94-9f89-7183cae09276';

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#3B5BA9',
  });
}

export async function requestNotificationPermission() {
  await ensureAndroidNotificationChannel();

  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  console.log('[notifications] permiso actual', { status, canAskAgain });

  if (status !== 'granted' && canAskAgain) {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    console.log('[notifications] permiso solicitado', { status: newStatus });
    return newStatus === 'granted';
  }

  if (status !== 'granted') {
    console.warn('[notifications] permiso no concedido y no se puede volver a pedir', {
      status,
      canAskAgain,
    });
  }

  return status === 'granted';
}

export async function sendTestNotification() {
  const granted = await requestNotificationPermission();

  if (!granted) {
    alert('Notification permissions not granted');
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Ready for the mosh pit..",
      body: "Shaka brah.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    },
  });
}

export async function scheduleEventNotification(event) {
  const granted = await requestNotificationPermission();

  if (!granted) return;

  const settings =
    JSON.parse(await AsyncStorage.getItem("notificationSettings")) || {
      enabled: true,
      // advance is stored in minutes
      advance: "60",
    };

  if (!settings.enabled) return;

  const eventDate = new Date(event.date);
  const advanceMinutes = parseFloat(settings.advance);
  const notifyDate = new Date(eventDate.getTime() - advanceMinutes * 60 * 1000);

  if (notifyDate < new Date()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `¡Tu evento "${event.title}" es pronto!`,
      body: `Recuerda que el evento es el ${event.date}`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: notifyDate,
    },
  });
}

export async function registerPushTokenForUser(userId) {
  if (!userId) return null;

  const granted = await requestNotificationPermission();
  if (!granted) {
    console.warn('[notifications] no se registra token porque no hay permiso', { userId });
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: EXPO_PROJECT_ID,
  });
  const expoPushToken = tokenData?.data;

  if (!expoPushToken) {
    console.warn('[notifications] Expo no devolvió token push', { userId });
    return null;
  }

  const response = await fetch(`${API_URL}/users/${userId}/push-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expoPushToken }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn('No se pudo guardar el token push:', response.status, text);
    return null;
  }

  console.log('Expo push token registrado para usuario', userId);

  return expoPushToken;
}
