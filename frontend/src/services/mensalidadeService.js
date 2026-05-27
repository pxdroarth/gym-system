import {
  cadastrarMensalidade,
  fetchMensalidades,
  fetchMensalidadesPorAluno,
  gerarMensalidadesFuturas,
  updateMensalidadeStatus,
} from "./Api";

export {
  cadastrarMensalidade,
  fetchMensalidadesPorAluno,
  fetchMensalidades,
  gerarMensalidadesFuturas,
  updateMensalidadeStatus,
};

export const mensalidadeService = {
  cadastrarMensalidade,
  fetchMensalidadesPorAluno,
  fetchMensalidades,
  gerarMensalidadesFuturas,
  updateMensalidadeStatus,
};
