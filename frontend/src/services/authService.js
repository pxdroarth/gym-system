import { api, refreshAccessToken } from "./Api";

export async function loginRequest(payload) {
  const { data } = await api.post("/auth/login", payload, {
    _skipAuthHeader: true,
    _skipAuthRefresh: true,
  });
  return data;
}

export async function logoutRequest() {
  const { data } = await api.post("/auth/logout", null, {
    _skipAuthRefresh: true,
  });
  return data;
}

export async function logoutAllRequest() {
  const { data } = await api.post("/auth/logout-all", null, {
    _skipAuthRefresh: true,
  });
  return data;
}

export async function meRequest(config = {}) {
  const { data } = await api.get("/auth/me", config);
  return data;
}

export async function refreshSession() {
  return refreshAccessToken();
}
