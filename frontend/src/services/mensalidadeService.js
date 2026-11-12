import {
  api,
  cadastrarMensalidade,
  fetchMensalidades,
  fetchMensalidadesPorAluno,
} from "./Api";

export {
  cadastrarMensalidade,
  fetchMensalidadesPorAluno,
  fetchMensalidades,
};

export const mensalidadeService = {
  cadastrarMensalidade,
  fetchMensalidadesPorAluno,
  fetchMensalidades,
};

export async function emitirMensalidadePadrao(alunoId) {
  const { data } = await api.post('/mensalidades/padrao', { aluno_id: alunoId });
  return data;
}

export async function concederDescontoMensalidade(id, payload) {
  const { data } = await api.patch(`/mensalidades/${id}/desconto`, payload);
  return data;
}
