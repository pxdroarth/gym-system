const TOKEN_KEY = "academia_sa_auth_token";
const USER_KEY = "academia_sa_auth_user";

export function getAuthToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token) {
  if (!token) {
    window.localStorage.removeItem(TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function getStoredUser() {
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setStoredUser(user) {
  if (!user) {
    window.localStorage.removeItem(USER_KEY);
    return;
  }
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateStoredUser(updater) {
  const current = getStoredUser();
  if (!current) return null;

  const next = typeof updater === "function" ? updater(current) : updater;
  setStoredUser(next);
  return next;
}

export function clearAuthStorage() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}
