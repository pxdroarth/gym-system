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

// Baixa: meio opcional (L04 sublote C).
export async function marcarComoPago(id, meio) {
  const { data } = await api.patch(`/contas-financeiras/${id}/status`, { status: "pago", ...(meio ? { meio_baixa: meio } : {}) });
  return data;
}

// ---------- Estorno de baixa de conta (L04, sublote C) ----------
export async function fetchEstornosBaixa(params = {}) {
  const { data } = await api.get("/contas-financeiras/estornos-baixa", { params });
  return data;
}

export async function solicitarEstornoBaixa(contaId, motivo) {
  const { data } = await api.post(`/contas-financeiras/${contaId}/estornos-baixa`, { motivo });
  return data;
}

export async function aprovarEstornoBaixa(estornoId) {
  const { data } = await api.post(`/contas-financeiras/estornos-baixa/${estornoId}/aprovar`);
  return data;
}

export async function registrarAutorizacaoExternaEstornoBaixa(estornoId, dados) {
  const { data } = await api.post(`/contas-financeiras/estornos-baixa/${estornoId}/autorizacao-externa`, dados);
  return data;
}

export async function executarEstornoBaixa(estornoId) {
  const { data } = await api.post(`/contas-financeiras/estornos-baixa/${estornoId}/executar`);
  return data;
}

export async function fetchAutorizadoresEstornoBaixa() {
  const { data } = await api.get("/contas-financeiras/estornos-baixa/autorizadores");
  return data;
}

export async function fetchPoliticaEstornoBaixa() {
  const { data } = await api.get("/contas-financeiras/estornos-baixa/politica");
  return data;
}

export async function salvarPoliticaEstornoBaixa(contasDistintas) {
  const { data } = await api.patch("/contas-financeiras/estornos-baixa/politica", { contas_distintas: contasDistintas });
  return data;
}

export async function deletarContaFinanceira(id) {
  const { data } = await api.delete(`/contas-financeiras/${id}`);
  return data;
}
