import { api } from "./Api";

export async function fetchAuditLogs(params = {}) {
  const response = await api.get("/audit-logs", { params });
  return response.data;
}

export async function fetchAuditLogById(id, params = {}) {
  const response = await api.get(`/audit-logs/${id}`, { params });
  return response.data;
}
