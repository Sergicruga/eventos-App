import React from "react";
import { ScrollView, Text, View } from "react-native";

export default function PrivacyPolicyScreen() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView>
        <Text style={{ fontSize: 16, lineHeight: 22 }}>
{`POLÍTICA DE PRIVACIDAD – APP DE EVENTOS

Última actualización: 15/12/2025

1. Responsable del tratamiento
[Tu nombre o empresa]

2. Datos que recopilamos
- Email y usuario
- Ubicación del evento (solo si la introduces)
- Fotografías subidas
- Analítica y errores (Firebase / Sentry)
- Notificaciones push

3. Finalidad
Gestionar cuentas, eventos, seguridad y notificaciones.

4. Conservación
Mientras la cuenta esté activa.

5. Derechos
Acceso, rectificación y eliminación de datos.

Contacto: soporte@tudominio.com
`}
        </Text>
      </ScrollView>
    </View>
  );
}
