import axios from "axios";
import {
  clearAuthStorage,
  getAuthToken,
  getStoredUser,
  setAuthToken,
  setStoredUser,
} from "../utils/authStorage";

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

let authFailureHandler = null;
let refreshPromise = null;

const AUTH_REFRESH_PATH = "/auth/refresh";
const AUTH_ROUTES_WITHOUT_REFRESH_RETRY = [
  "/auth/login",
  AUTH_REFRESH_PATH,
  "/auth/logout",
  "/auth/logout-all",
];

function unwrapData(payload) {
  return payload?.data ?? payload ?? null;
}

function getRequestPath(config = {}) {
  const url = config.url || "";
  if (!url) return "";

  try {
    const resolved = new URL(url, config.baseURL || API_BASE_URL);
    return resolved.pathname;
  } catch {
    return url.split("?")[0];
  }
}

function shouldSkipRefreshRetry(config = {}) {
  if (config._skipAuthRefresh === true || config.skipAuthRefresh === true) return true;
  const path = getRequestPath(config);
  return AUTH_ROUTES_WITHOUT_REFRESH_RETRY.includes(path);
}

function normalizeRefreshedUser(user) {
  if (!user) return null;

  const storedUser = getStoredUser();
  const units = Array.isArray(user.allowedUnits) ? user.allowedUnits : [];
  const storedUnitId = storedUser?.currentUnit?.id;
  const currentUnit = storedUnitId
    ? units.find((unit) => Number(unit.id) === Number(storedUnitId)) || user.currentUnit || units[0] || null
    : user.currentUnit || units[0] || null;
  const tenant = user.tenant || (currentUnit ? { id: currentUnit.tenant_id } : null);

  return {
    ...user,
    tenant,
    currentUnit,
    allowedUnits: units,
  };
}

export function setAuthFailureHandler(handler) {
  authFailureHandler = typeof handler === "function" ? handler : null;
}

function handleRefreshFailure() {
  clearAuthStorage();
  if (authFailureHandler) {
    authFailureHandler();
  }
}

async function requestRefreshAccessToken() {
  const { data } = await api.post(
    AUTH_REFRESH_PATH,
    null,
    {
      _skipAuthHeader: true,
      _skipAuthRefresh: true,
    }
  );
  const refreshed = unwrapData(data);

  if (refreshed?.token) {
    setAuthToken(refreshed.token);
  }

  if (refreshed?.usuario) {
    setStoredUser(normalizeRefreshedUser(refreshed.usuario));
  }

  return refreshed;
}

export async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = requestRefreshAccessToken()
      .catch((error) => {
        handleRefreshFailure();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

api.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  const shouldSkipAuthHeader = config._skipAuthHeader === true || config.skipAuthHeader === true;

  if (shouldSkipAuthHeader) {
    delete config.headers.Authorization;
    delete config.headers.authorization;
  }

  const token = shouldSkipAuthHeader ? null : getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const currentUnitId = getStoredUser()?.currentUnit?.id;
  if (currentUnitId) {
    config.headers["X-Unit-Id"] = currentUnitId;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;
    const status = error?.response?.status;

    if (!originalRequest || status !== 401 || originalRequest._retry || shouldSkipRefreshRetry(originalRequest)) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const refreshed = await refreshAccessToken();

      if (!refreshed?.token) {
        throw new Error("Refresh sem access token.");
      }

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${refreshed.token}`;
      return api(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);

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

export async function previewCoberturaPlano(payload) {
  const response = await api.post('/planos/preview-cobertura', payload);
  return response.data;
}

export async function contratarRenovarPlano(payload) {
  const response = await api.post('/planos/contratar-renovar', payload);
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

export async function updateMensalidadeStatus(id, status) {
  const response = await api.patch(`/mensalidades/${id}/status`, { status });
  return response.data;
}
