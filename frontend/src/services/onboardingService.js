import { api } from "./Api";

export async function criarTenantOnboarding(payload) {
  const { data } = await api.post("/onboarding/tenants", payload);
  return data;
}
