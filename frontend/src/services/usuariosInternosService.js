import { api } from "./Api";

export async function listarUsuariosInternos() {
  const { data } = await api.get('/usuarios-internos');
  return data;
}

export async function criarUsuarioInterno(payload) {
  const { data } = await api.post('/usuarios-internos', payload);
  return data;
}

export async function alterarPapelUsuarioInterno(id, papel) {
  const { data } = await api.patch(`/usuarios-internos/${id}/papel`, { papel });
  return data;
}

export async function alterarStatusUsuarioInterno(id, status) {
  const { data } = await api.patch(`/usuarios-internos/${id}/status`, { status });
  return data;
}
