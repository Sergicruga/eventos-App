import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function requestNotificationPermission() {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && canAskAgain) {
    const { status: newStatus } = await Notifications.requestPermissionsAsync();
    return newStatus === 'granted';
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
    trigger: { seconds: 2 }, // triggers after 2 seconds
  });
}

export async function scheduleEventNotification(event) {
  const settings = JSON.parse(await AsyncStorage.getItem("notificationSettings")) || { enabled: true, advance: "1" };
  if (!settings.enabled) return;

  const eventDate = new Date(event.date); // event.date should be ISO string
  const advanceDays = parseFloat(settings.advance);
  const notifyDate = new Date(eventDate.getTime() - advanceDays * 24 * 60 * 60 * 1000);

  // If notification time is in the past, don't schedule
  if (notifyDate < new Date()) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `¡Tu evento "${event.title}" es pronto!`,
      body: `Recuerda que el evento es el ${event.date}`,
    },
    trigger: notifyDate,
  });
}