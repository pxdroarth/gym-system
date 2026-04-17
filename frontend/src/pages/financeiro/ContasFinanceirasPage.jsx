import React, { useState, useEffect } from "react";
import {
  getContasFinanceiras,
  criarContaFinanceira,
  atualizarContaFinanceira,
  marcarComoPago,
  deletarContaFinanceira,
} from "../../services/contasFinanceiras";
import ContaFinanceiraModal from "./modals/ContaFinanceiraModal";

const perPage = 10;

export default function ContasFinanceirasPage() {
  const [contas, setContas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAberto, setModalAberto] = useState(false);
  const [contaEditando, setContaEditando] = useState(null); // Conta sendo editada
  const [erro, setErro] = useState(null);

  const [filtros, setFiltros] = useState({
    tipo: 'todos',
    status: 'todos',
    data_inicial: '',
    data_final: '',
    descricao: ''
  });

  // Carrega contas do backend com filtros e paginação
  async function carregar(pageParam = page) {
    setErro(null);
    try {
      const dados = await getContasFinanceiras({
        ...filtros,
        page: pageParam,
        perPage
      });
      setContas(dados.data || []);
      setTotal(dados.total || 0);
    } catch (e) {
      setErro("Erro ao buscar contas financeiras");
    }
  }

  // Sempre que filtros mudarem, volta pra página 1 e recarrega
  useEffect(() => {
    setPage(1);
    carregar(1);
    // eslint-disable-next-line
  }, [JSON.stringify(filtros)]);

  // Sempre que a página mudar (sem mudar filtro)
  useEffect(() => {
    carregar(page);
    // eslint-disable-next-line
  }, [page]);

  // Manipula filtros
  function handleFiltro(e) {
    setFiltros(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  // Limpa todos filtros
  function limparFiltros() {
    setFiltros({
      tipo: 'todos',
      status: 'todos',
      data_inicial: '',
      data_final: '',
      descricao: ''
    });
  }

  // Paginação: calcula total de páginas
  const totalPaginas = Math.ceil(total / perPage);

  // Confirmar pagamento (status "pago")
  async function confirmarPagamento(id) {
    try {
      await marcarComoPago(id); // CORRIGIDO!
      carregar(page);
    } catch {
      alert("Erro ao confirmar pagamento");
    }
  }

  // Excluir conta
  async function excluirConta(id) {
    if (!window.confirm("Deseja realmente excluir esta conta?")) return;
    try {
      await deletarContaFinanceira(id);
      carregar(page);
    } catch {
      alert("Erro ao excluir conta");
    }
  }

  // Abrir modal para novo OU edição
  function abrirModal(conta = null) {
    setContaEditando(conta);
    setModalAberto(true);
  }

  return (
    <div className="bg-white rounded shadow p-6">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <input
          type="text"
          name="descricao"
          className="border p-2 rounded"
          placeholder="Descrição"
          value={filtros.descricao}
          onChange={handleFiltro}
        />
        <select
          name="tipo"
          className="border p-2 rounded"
          value={filtros.tipo}
          onChange={handleFiltro}
        >
          <option value="todos">Todos Tipos</option>
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </select>
        <select
          name="status"
          className="border p-2 rounded"
          value={filtros.status}
          onChange={handleFiltro}
        >
          <option value="todos">Todos Status</option>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
        </select>
        <input
          type="date"
          name="data_inicial"
          className="border p-2 rounded"
          value={filtros.data_inicial}
          onChange={handleFiltro}
        />
        <input
          type="date"
          name="data_final"
          className="border p-2 rounded"
          value={filtros.data_final}
          onChange={handleFiltro}
        />
        <button
          onClick={limparFiltros}
          className="bg-gray-200 text-gray-700 px-3 py-2 rounded hover:bg-gray-300"
        >
          Limpar Filtros
        </button>
        <button
          onClick={() => abrirModal(null)}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700 ml-auto"
        >
          + Nova Conta Financeira
        </button>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-semibold">Descrição</th>
              <th className="px-3 py-2 text-left font-semibold">Tipo</th>
              <th className="px-3 py-2 text-left font-semibold">Valor</th>
              <th className="px-3 py-2 text-left font-semibold">Plano de Contas</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Data</th>
              <th className="px-3 py-2 text-left font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {erro ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-red-600">{erro}</td>
              </tr>
            ) : contas.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-10 text-gray-400">
                  Nenhuma conta financeira encontrada.
                </td>
              </tr>
            ) : (
              contas.map(conta => (
                <tr key={conta.id} className="hover:bg-blue-50 transition">
                  <td className="px-3 py-2">{conta.descricao}</td>
                  <td className="px-3 py-2 capitalize">{conta.tipo}</td>
                  <td className="px-3 py-2">R$ {Number(conta.valor).toLocaleString("pt-BR", {minimumFractionDigits: 2})}</td>
                  <td className="px-3 py-2">{conta.plano_nome || "-"}</td>
                  <td className="px-3 py-2 capitalize">
                    <span className={
                      conta.status === "pago"
                        ? "text-green-600 font-semibold"
                        : conta.status === "pendente"
                        ? "text-orange-500 font-semibold"
                        : "text-gray-800"
                    }>
                      {conta.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {conta.data_lancamento
                      ? new Date(conta.data_lancamento).toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                  <td className="px-3 py-2 space-x-1">
                    {conta.status === "pendente" && (
                      <button
                        className="text-green-700 border border-green-600 px-2 py-1 rounded text-xs hover:bg-green-100"
                        onClick={() => confirmarPagamento(conta.id)}
                      >
                        Confirmar Pagamento
                      </button>
                    )}
                    <button
                      className="text-blue-600 underline text-xs"
                      onClick={() => abrirModal(conta)}
                    >
                      Editar
                    </button>
                    <button
                      className="text-red-600 underline text-xs"
                      onClick={() => excluirConta(conta.id)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex justify-between items-center mt-4">
        <span className="text-gray-500">
          {total} registro(s) encontrado(s)
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >Anterior</button>
          <span className="px-3 py-1">{page} / {totalPaginas || 1}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPaginas}
            className="px-3 py-1 border rounded disabled:opacity-50"
          >Próxima</button>
        </div>
      </div>

      {/* Modal para nova conta ou edição */}
      <ContaFinanceiraModal
        aberto={modalAberto}
        conta={contaEditando}
        onClose={() => {
          setModalAberto(false);
          setContaEditando(null);
        }}
        onSalvo={() => {
          setModalAberto(false);
          setContaEditando(null);
          carregar(page);
        }}
      />
    </div>
  );
}
