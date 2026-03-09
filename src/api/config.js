import { Platform } from 'react-native';

const LAN_IP = '192.168.1.37';
const PORT = 4000;

const host = Platform.select({
  android: LAN_IP,
  ios: LAN_IP,
  default: LAN_IP,
});

export const API_URL = 'http://${host}:${PORT}';