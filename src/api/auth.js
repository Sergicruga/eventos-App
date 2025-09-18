import { API_URL } from "../api/config";

export async function registerApi(data) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text();              // 👈 lee texto bruto
    let msg = "Error al registrar";
    try { msg = (JSON.parse(txt).message) || msg; } catch {}
    throw new Error(msg);
  } 
  return res.json(); // { user, token }
}

export async function loginApi(data) {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Credenciales inválidas");
  }
  return res.json(); // { user, token }
}
