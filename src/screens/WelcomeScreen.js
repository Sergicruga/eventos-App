import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";

export default function WelcomeScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tu App de Eventos</Text>
      <Text style={styles.subtitle}>Descubre, crea y comparte</Text>

      <TouchableOpacity style={[styles.btn, styles.primary]} onPress={() => navigation.navigate("Login")}>
        <Text style={styles.btnText}>Iniciar sesión</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.btn, styles.secondary]} onPress={() => navigation.navigate("Register")}>
        <Text style={styles.btnText}>Crear cuenta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{ 
    flex:1, 
    justifyContent:"center", 
    alignItems:"center", 
    padding:24,
    backgroundColor:"#FFFFFF"
  },

  title:{ 
    fontSize:28, 
    fontWeight:"700", 
    marginBottom:8,
    color:"#111827"
  },

  subtitle:{ 
    fontSize:16, 
    color:"#4B5563", 
    marginBottom:24 
  },

  btn:{ 
    width:"100%", 
    padding:14, 
    borderRadius:12, 
    alignItems:"center", 
    marginBottom:12 
  },

  primary:{ 
    backgroundColor:"#111827" 
  },

  secondary:{ 
    backgroundColor:"#4B5563" 
  },

  btnText:{ 
    color:"#FFFFFF", 
    fontWeight:"600" 
  },
});
