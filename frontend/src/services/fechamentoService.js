import { api } from "./Api";

// Fechamento mensal com conferencia por meio e ressalva (L04, sublote D).
export async function fetchFechamentoMes(ano, mes) {
  const { data } = await api.get(`/fechamento-mensal/${ano}/${mes}`);
  return data;
}

export async function fetchFechamentos() {
  const { data } = await api.get("/fechamento-mensal");
  return data;
}

export async function fetchResponsaveisFechamento() {
  const { data } = await api.get("/fechamento-mensal/responsaveis");
  return data;
}

export async function fecharMes(ano, mes, dados = {}) {
  const { data } = await api.post(`/fechamento-mensal/${ano}/${mes}/fechar`, dados);
  return data;
}

export async function reabrirMes(ano, mes, motivo) {
  const { data } = await api.post(`/fechamento-mensal/${ano}/${mes}/reabrir`, { motivo });
  return data;
}
