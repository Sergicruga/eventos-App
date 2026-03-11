import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Production API (Render)
const PROD_API = 'https://eventos-app-oy65.onrender.com';

// Local fallback for development
const LAN_IP = '192.168.1.37';
const PORT = 4000;
const host = Platform.select({ android: LAN_IP, ios: LAN_IP, default: LAN_IP });
const hostStr = String(host || LAN_IP);
const LOCAL_FALLBACK = 'http://' + hostStr + ':' + String(PORT);

export const API_URL =
  Constants?.expoConfig?.extra?.API_URL ||
  Constants?.manifest?.extra?.API_URL ||
  (typeof process !== 'undefined' && process.env?.API_URL) ||
  PROD_API ||
  LOCAL_FALLBACK;