import React, { useEffect, useRef } from "react";
import { Alert, Linking, Platform } from "react-native";
import appConfig from "../../app.json";
import { API_URL } from "../config";

const ANDROID_PACKAGE = appConfig?.expo?.android?.package || "com.sergicruga.eventoapp";
const CURRENT_VERSION = appConfig?.expo?.version || "";
const CURRENT_VERSION_CODE = Number(appConfig?.expo?.android?.versionCode || 0);
const DEFAULT_PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

async function openStore(url = DEFAULT_PLAY_STORE_URL) {
  const marketUrl = `market://details?id=${ANDROID_PACKAGE}`;

  if (Platform.OS === "android") {
    try {
      const canOpenMarket = await Linking.canOpenURL(marketUrl);
      if (canOpenMarket) {
        await Linking.openURL(marketUrl);
        return;
      }
    } catch {}
  }

  await Linking.openURL(url || DEFAULT_PLAY_STORE_URL);
}

export default function AppUpdateGate() {
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;

    const checkForUpdate = async () => {
      try {
        const res = await fetch(`${API_URL}/app-version?platform=${Platform.OS}`);
        if (!res.ok) return;

        const data = await res.json();
        const latestVersionCode = Number(data?.latestVersionCode || 0);
        const minVersionCode = Number(data?.minVersionCode || 0);
        const storeUrl = data?.storeUrl || DEFAULT_PLAY_STORE_URL;

        if (!CURRENT_VERSION_CODE || latestVersionCode <= CURRENT_VERSION_CODE) return;

        const required = minVersionCode > CURRENT_VERSION_CODE || data?.required === true;
        const title = required ? "Actualización necesaria" : "Nueva versión disponible";
        const message = required
          ? "Para seguir usando GoPlan necesitas actualizar a la última versión."
          : "Hay una nueva versión de GoPlan disponible en Google Play.";

        Alert.alert(
          title,
          message,
          required
            ? [
                {
                  text: "Actualizar",
                  onPress: () => openStore(storeUrl),
                },
              ]
            : [
                { text: "Ahora no", style: "cancel" },
                {
                  text: "Actualizar",
                  onPress: () => openStore(storeUrl),
                },
              ],
          { cancelable: !required }
        );
      } catch (error) {
        console.warn("No se pudo comprobar actualización:", error?.message || error);
      }
    };

    checkForUpdate();
  }, []);

  return null;
}
