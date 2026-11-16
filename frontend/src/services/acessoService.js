import { api } from "./Api";
import {
  fetchAcessos,
  fetchTodosAcessos,
  simularAcesso,
} from "./Api";

export {
  fetchAcessos,
  fetchTodosAcessos,
  simularAcesso,
};

export const acessoService = {
  fetchAcessos,
  fetchTodosAcessos,
  simularAcesso,
};

export async function registrarAcesso(alunoId) {
  const { data } = await api.post("/acessos", { aluno_id: alunoId });
  return data;
}
