import React, { useState, useEffect } from "react";
import { View, Text, Switch, Button } from "react-native";
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function NotificationSettingsScreen() {
  const [enabled, setEnabled] = useState(true);
  const [advance, setAdvance] = useState("1"); // 1 day

  useEffect(() => {
    AsyncStorage.getItem("notificationSettings").then(data => {
      if (data) {
        const { enabled, advance } = JSON.parse(data);
        setEnabled(enabled);
        setAdvance(advance);
      }
    });
  }, []);

  const saveSettings = async () => {
    await AsyncStorage.setItem("notificationSettings", JSON.stringify({ enabled, advance }));
    alert("Settings saved!");
  };

  return (
    <View style={{ flex: 1, padding: 24 }}>
      <Text style={{ fontSize: 18, fontWeight: "bold" }}>Notificaciones de eventos</Text>
      <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 16 }}>
        <Text>Recordatorios activados</Text>
        <Switch value={enabled} onValueChange={setEnabled} />
      </View>
      <Text>¿Cuánto antes quieres ser avisado?</Text>
      <Picker selectedValue={advance} onValueChange={setAdvance} style={{ height: 50, width: 200 }}>
        <Picker.Item label="1 hora antes" value="0.041" />
        <Picker.Item label="1 día antes" value="1" />
        <Picker.Item label="3 días antes" value="3" />
      </Picker>
      <Button title="Guardar" onPress={saveSettings} />
    </View>
  );
}