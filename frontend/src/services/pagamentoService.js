import {
  aprovarEstornoPagamento,
  executarEstornoPagamento,
  fetchAutorizadoresEstornoPagamento,
  fetchEstornosPagamento,
  fetchPagamentosAluno,
  fetchPoliticaEstornoPagamento,
  registrarAutorizacaoExternaEstornoPagamento,
  registrarPagamento,
  salvarPoliticaEstornoPagamento,
  solicitarEstornoPagamento,
} from "./Api";

export {
  registrarPagamento,
  fetchPagamentosAluno,
  fetchEstornosPagamento,
  solicitarEstornoPagamento,
  aprovarEstornoPagamento,
  registrarAutorizacaoExternaEstornoPagamento,
  fetchAutorizadoresEstornoPagamento,
  executarEstornoPagamento,
  fetchPoliticaEstornoPagamento,
  salvarPoliticaEstornoPagamento,
};

export const pagamentoService = {
  registrarPagamento,
};
