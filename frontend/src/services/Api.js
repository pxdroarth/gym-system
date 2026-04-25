import axios from "axios";
import { getAuthToken, getStoredUser } from "../utils/authStorage";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const currentUnitId = getStoredUser()?.currentUnit?.id;
  if (currentUnitId) {
    config.headers["X-Unit-Id"] = currentUnitId;
  }
  return config;
});

// ============ ALUNOS ============
export async function fetchAlunos() {
  const { data } = await api.get('/alunos');
  return data;
}

export async function fetchAlunoById(id) {
  const { data } = await api.get(`/alunos/${id}`);
  return data;
}

export async function createAluno(dadosAluno) {
  const response = await api.post('/alunos', dadosAluno);
  return response.data;
}

export async function updateAluno(id, dadosAluno) {
  const response = await api.put(`/alunos/${id}`, dadosAluno);
  return response.data;
}

export async function fetchAlunosPesquisa({ termo, pagina = 1, limite = 15 } = {}) {
  const response = await api.get('/alunos/pesquisa', {
    params: { termo, pagina, limite },
  });
  return response.data;
}

// ============ MENSALIDADES ============
export async function cadastrarMensalidade(dados) {
  const response = await api.post('/mensalidades', dados);
  return response.data;
}

export async function fetchMensalidadesPorAluno(alunoId, pagina = 1, limite = 10) {
  const response = await api.get(`/mensalidades/aluno/${alunoId}`, {
    params: { pagina, limite },
  });
  return response.data;
}

export async function fetchMensalidades(params = {}) {
  const response = await api.get('/mensalidades', { params });
  return response.data;
}

// ============ PAGAMENTOS ============
export async function registrarPagamento(payload) {
  const response = await api.post('/pagamentos', payload);
  return response.data;
}

// ============ ACESSOS ============
export async function fetchAcessos(alunoId, pagina = 1, limite = 10) {
  const response = await api.get(`/acessos/aluno/${alunoId}`, {
    params: { pagina, limite },
  });
  return response.data;
}

export async function fetchTodosAcessos() {
  const response = await api.get('/acessos');
  return response.data;
}

export async function simularAcesso(aluno_id) {
  const response = await api.post('/acessos/mock-hikvision', { aluno_id });
  return response.data;
}

// ============ PLANOS ============
export async function fetchPlanos() {
  const response = await api.get('/planos');
  return response.data;
}

export async function createPlano(dadosPlano) {
  const response = await api.post('/planos', dadosPlano);
  return response.data;
}

export async function updatePlano(id, dadosPlano) {
  const response = await api.put(`/planos/${id}`, dadosPlano);
  return response.data;
}

// ============ VINCULOS ============
export async function fetchPlanoAssociados(responsavelId) {
  const response = await api.get(`/plano-associado/${responsavelId}`);
  return response.data;
}

export async function createPlanoAssociado(payload) {
  const response = await api.post('/plano-associado', payload);
  return response.data;
}

export async function deletePlanoAssociado(id) {
  const response = await api.delete(`/plano-associado/${id}`);
  return response.data;
}

// ============ PRODUTOS ============
export async function fetchProdutos() {
  const response = await api.get('/produtos');
  return response.data;
}

export async function createProduto(dadosProduto) {
  const response = await api.post('/produtos', dadosProduto, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function updateProduto(id, dadosProduto) {
  const response = await api.put(`/produtos/${id}`, dadosProduto, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function deleteProduto(id) {
  const response = await api.delete(`/produtos/${id}`);
  return response.data;
}

// ============ VENDAS ============
export async function fetchVendasProdutos(params = {}) {
  if (typeof params === 'string') {
    const parsed = Object.fromEntries(new URLSearchParams(params));
    params = parsed;
  }

  const { data_inicial = "", data_final = "", pagina = 1, limite = 10 } = params;
  const response = await api.get('/vendas-produtos', {
    params: { data_inicial, data_final, pagina, limite },
  });
  return response.data;
}

export async function createVendaProduto(dadosVenda) {
  const response = await api.post('/vendas-produtos', dadosVenda);
  return response.data;
}

// ============ MENSALIDADES LEGADAS ============
export async function fetchMensalidadesAlunoStatus(alunoId, status) {
  const response = await api.get(`/mensalidades/aluno/${alunoId}`, {
    params: { status },
  });
  return response.data;
}

export async function registrarPagamentoAntecipado(payload) {
  const response = await api.post('/mensalidades/pagamento-antecipado', payload);
  return response.data;
}

export async function gerarMensalidadesFuturas(payload) {
  const response = await api.post('/mensalidades/gerar-futuras', payload);
  return response.data;
}

export async function updateMensalidadeStatus(id, status) {
  const response = await api.patch(`/mensalidades/${id}/status`, { status });
  return response.data;
}
