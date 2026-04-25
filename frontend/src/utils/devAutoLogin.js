export function isDevAutoLoginEnabled() {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_AUTO_LOGIN === "true";
}

export function getDevLoginCredentials() {
  return {
    login: import.meta.env.VITE_DEV_LOGIN || "",
    senha: import.meta.env.VITE_DEV_PASSWORD || "",
  };
}