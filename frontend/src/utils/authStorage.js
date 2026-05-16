const TOKEN_KEY = "academia_sa_auth_token";
const USER_KEY = "academia_sa_auth_user";

let accessToken = null;
let storedUser = null;

function removeAuthKeys(storage) {
  if (!storage) return;
  try {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(USER_KEY);
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

export function clearLegacyAuthStorage() {
  if (typeof window === "undefined") return;
  try {
    removeAuthKeys(window.localStorage);
    removeAuthKeys(window.sessionStorage);
  } catch {
    // Accessing storage itself can fail when a browser blocks it.
  }
}

export function getAuthToken() {
  return accessToken;
}

export function setAuthToken(token) {
  clearLegacyAuthStorage();

  if (!token) {
    accessToken = null;
    return;
  }

  accessToken = token;
}

export function getStoredUser() {
  return storedUser;
}

export function setStoredUser(user) {
  clearLegacyAuthStorage();

  if (!user) {
    storedUser = null;
    return;
  }

  storedUser = user;
}

export function updateStoredUser(updater) {
  const current = getStoredUser();
  if (!current) return null;

  const next = typeof updater === "function" ? updater(current) : updater;
  setStoredUser(next);
  return next;
}

export function clearAuthStorage() {
  accessToken = null;
  storedUser = null;
  clearLegacyAuthStorage();
}
