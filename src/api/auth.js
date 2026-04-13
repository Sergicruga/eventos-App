import { API_URL } from '../config';

export async function registerApi(data) {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text();
    let msg = "Error al enviar código";
    try { msg = (JSON.parse(txt).message) || msg; } catch {}
    throw new Error(msg);
  }
  return res.json(); // { message }
}

export async function verifyRegisterApi(data) {
  const res = await fetch(`${API_URL}/auth/verify-register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text();
    let msg = "Error al verificar código";
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
    throw new Error(err.message || "Error al enviar código");
  }
  return res.json(); // { message }
}

export async function verifyLoginApi(data) {
  const res = await fetch(`${API_URL}/auth/verify-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Código inválido");
  }
  return res.json(); // { user, token }
}
