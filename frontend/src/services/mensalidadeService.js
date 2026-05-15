import {
  cadastrarMensalidade,
  fetchMensalidades,
  fetchMensalidadesAlunoStatus,
  fetchMensalidadesPorAluno,
  gerarMensalidadesFuturas,
  registrarPagamentoAntecipado,
  updateMensalidadeStatus,
} from "./Api";

export {
  cadastrarMensalidade,
  fetchMensalidadesPorAluno,
  fetchMensalidades,
  fetchMensalidadesAlunoStatus,
  registrarPagamentoAntecipado,
  gerarMensalidadesFuturas,
  updateMensalidadeStatus,
};

export const mensalidadeService = {
  cadastrarMensalidade,
  fetchMensalidadesPorAluno,
  fetchMensalidades,
  fetchMensalidadesAlunoStatus,
  registrarPagamentoAntecipado,
  gerarMensalidadesFuturas,
  updateMensalidadeStatus,
};
