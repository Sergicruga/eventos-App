import { Platform } from "react-native";

const LAN_IP = "192.168.1.38"; // la IP que acabas de comprobar
const PORT = 4000;

const host = Platform.select({
  android: LAN_IP,   // dispositivo físico Android
  ios: LAN_IP,       // dispositivo físico iOS
  default: LAN_IP,
});

export const API_URL = `http://${host}:${PORT}`;