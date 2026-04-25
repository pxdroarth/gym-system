import { api } from "./Api";

export async function loginRequest(payload) {
  const { data } = await api.post("/auth/login", payload);
  return data;
}

export async function logoutRequest() {
  const { data } = await api.post("/auth/logout");
  return data;
}

export async function meRequest() {
  const { data } = await api.get("/auth/me");
  return data;
}
