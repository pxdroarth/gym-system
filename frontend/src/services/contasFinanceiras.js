import { api } from "./Api";

export async function getContasFinanceiras({ page = 1, perPage = 10, ...filtros } = {}) {
  const { data } = await api.get('/contas-financeiras', {
    params: { page, perPage, ...filtros },
  });
  return data;
}

export async function criarContaFinanceira(dados) {
  const { data } = await api.post('/contas-financeiras', dados);
  return data;
}

export async function atualizarContaFinanceira(id, dados) {
  const { data } = await api.put(`/contas-financeiras/${id}`, dados);
  return data;
}

export async function marcarComoPago(id) {
  const { data } = await api.patch(`/contas-financeiras/${id}/status`, { status: "pago" });
  return data;
}

export async function deletarContaFinanceira(id) {
  const { data } = await api.delete(`/contas-financeiras/${id}`);
  return data;
}
