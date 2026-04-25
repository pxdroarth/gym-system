import { api } from "./Api";

export async function getPlanoContas() {
  const { data } = await api.get('/plano-contas');
  return data;
}

export async function createPlanoConta(dados) {
  const { data } = await api.post('/plano-contas', dados);
  return data;
}

export async function updatePlanoConta(id, dados) {
  const { data } = await api.put(`/plano-contas/${id}`, dados);
  return data;
}

export async function deletePlanoConta(id) {
  const { data } = await api.delete(`/plano-contas/${id}`);
  return data;
}
