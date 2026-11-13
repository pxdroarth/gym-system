import {
  aprovarEstornoVenda,
  createVendaProduto,
  executarEstornoVenda,
  fetchAutorizadoresEstornoVenda,
  fetchEstornosVenda,
  fetchPoliticaEstornoVenda,
  fetchVendasProdutos,
  registrarAutorizacaoExternaEstornoVenda,
  salvarPoliticaEstornoVenda,
  solicitarEstornoVenda,
} from "./Api";

export {
  fetchVendasProdutos,
  createVendaProduto,
  fetchEstornosVenda,
  solicitarEstornoVenda,
  aprovarEstornoVenda,
  registrarAutorizacaoExternaEstornoVenda,
  fetchAutorizadoresEstornoVenda,
  fetchPoliticaEstornoVenda,
  salvarPoliticaEstornoVenda,
  executarEstornoVenda,
};

export const vendaProdutoService = {
  fetchVendasProdutos,
  createVendaProduto,
  fetchEstornosVenda,
  solicitarEstornoVenda,
  aprovarEstornoVenda,
  registrarAutorizacaoExternaEstornoVenda,
  fetchAutorizadoresEstornoVenda,
  fetchPoliticaEstornoVenda,
  salvarPoliticaEstornoVenda,
  executarEstornoVenda,
};
