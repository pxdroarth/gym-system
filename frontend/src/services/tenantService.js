import { api } from "./Api";

export async function fetchTenantOverview() {
  const { data } = await api.get('/tenant-dashboard/resumo');
  return data;
}

export async function listarTenants() {
  const { data } = await api.get('/tenants');
  return data;
}

export async function buscarTenant(id) {
  const { data } = await api.get(`/tenants/${id}`);
  return data;
}

export async function atualizarTenant(id, payload) {
  const { data } = await api.patch(`/tenants/${id}`, payload);
  return data;
}

export async function listarUnitsPorTenant(tenantId) {
  const { data } = await api.get(`/units/tenant/${tenantId}`);
  return data;
}

export async function atualizarUnit(id, payload) {
  const { data } = await api.patch(`/units/${id}`, payload);
  return data;
}
