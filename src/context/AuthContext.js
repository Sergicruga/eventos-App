import React, { createContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const AuthContext = createContext();

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, token: null, loading: true });

  useEffect(() => {
    (async () => {
      try {
        const [token, userStr] = await Promise.all([
          AsyncStorage.getItem("auth:token"),
          AsyncStorage.getItem("auth:user"),
        ]);
        if (token && userStr) {
          setState({ user: JSON.parse(userStr), token, loading: false });
        } else {
          setState({ user: null, token: null, loading: false });
        }
      } catch (e) {
        setState({ user: null, token: null, loading: false });
      }
    })();
  }, []);

  const login = async ({ user, token }) => {
    await AsyncStorage.setItem("auth:token", token);
    await AsyncStorage.setItem("auth:user", JSON.stringify(user));
    setState({ user, token, loading: false });
  };

  const logout = async () => {
    await AsyncStorage.multiRemove(["auth:token", "auth:user"]);
    setState({ user: null, token: null, loading: false });
  };

  const value = useMemo(() => ({ ...state, login, logout }), [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
