import React, { useEffect, useState } from "react";
import {
  getContasFinanceiras,
  marcarComoPago,
  deletarContaFinanceira,
} from "../../services/contasFinanceiras";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import Table from "../../components/ui/Table";
import ContaFinanceiraModal from "./modals/ContaFinanceiraModal";

const perPage = 10;

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(status) {
  if (status === "pago") return <Badge tone="green">Pago</Badge>;
  if (status === "pendente") return <Badge tone="amber">Pendente</Badge>;
  return <Badge tone="gray">{status || "-"}</Badge>;
}

function tipoBadge(tipo) {
  return tipo === "receita"
    ? <Badge tone="green">Receita</Badge>
    : <Badge tone="red">Despesa</Badge>;
}

export default function ContasFinanceirasPage() {
  const [contas, setContas] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalAberto, setModalAberto] = useState(false);
  const [contaEditando, setContaEditando] = useState(null);
  const [erro, setErro] = useState(null);

  const [filtros, setFiltros] = useState({
    tipo: 'todos',
    status: 'todos',
    data_inicial: '',
    data_final: '',
    descricao: ''
  });

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

  useEffect(() => {
    setPage(1);
    carregar(1);
    // eslint-disable-next-line
  }, [JSON.stringify(filtros)]);

  useEffect(() => {
    carregar(page);
    // eslint-disable-next-line
  }, [page]);

  function handleFiltro(e) {
    setFiltros(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function limparFiltros() {
    setFiltros({
      tipo: 'todos',
      status: 'todos',
      data_inicial: '',
      data_final: '',
      descricao: ''
    });
  }

  const totalPaginas = Math.max(1, Math.ceil(total / perPage));

  async function confirmarPagamento(id) {
    try {
      await marcarComoPago(id);
      carregar(page);
    } catch {
      alert("Erro ao confirmar pagamento");
    }
  }

  async function excluirConta(id) {
    if (!window.confirm("Deseja realmente excluir esta conta?")) return;
    try {
      await deletarContaFinanceira(id);
      carregar(page);
    } catch {
      alert("Erro ao excluir conta");
    }
  }

  function abrirModal(conta = null) {
    setContaEditando(conta);
    setModalAberto(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Contas Financeiras</h2>
            <p className="ui-section-subtitle">Lançamentos, status de pagamento e plano de contas vinculado.</p>
          </div>
          <Button onClick={() => abrirModal(null)}>+ Nova Conta Financeira</Button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 items-end border-b">
          <Input
            label="Descrição"
            type="text"
            name="descricao"
            placeholder="Buscar descrição"
            value={filtros.descricao}
            onChange={handleFiltro}
          />
          <Select label="Tipo" name="tipo" value={filtros.tipo} onChange={handleFiltro}>
            <option value="todos">Todos Tipos</option>
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </Select>
          <Select label="Status" name="status" value={filtros.status} onChange={handleFiltro}>
            <option value="todos">Todos Status</option>
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
          </Select>
          <Input label="Data inicial" type="date" name="data_inicial" value={filtros.data_inicial} onChange={handleFiltro} />
          <Input label="Data final" type="date" name="data_final" value={filtros.data_final} onChange={handleFiltro} />
          <Button variant="ghost" onClick={limparFiltros}>Limpar Filtros</Button>
        </div>

        {erro ? (
          <EmptyState title={erro} />
        ) : contas.length === 0 ? (
          <EmptyState title="Nenhuma conta financeira encontrada." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Valor</th>
                <th>Plano de Contas</th>
                <th>Status</th>
                <th>Data</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {contas.map(conta => (
                <tr key={conta.id}>
                  <td className="font-semibold">{conta.descricao}</td>
                  <td>{tipoBadge(conta.tipo)}</td>
                  <td className="font-semibold">{formatarMoeda(conta.valor)}</td>
                  <td>{conta.plano_nome || "-"}</td>
                  <td>{statusBadge(conta.status)}</td>
                  <td>
                    {conta.data_lancamento
                      ? new Date(conta.data_lancamento).toLocaleDateString("pt-BR")
                      : "-"}
                  </td>
                  <td>
                    <div className="flex gap-2 flex-wrap">
                      {conta.status === "pendente" && (
                        <Button size="sm" variant="success" onClick={() => confirmarPagamento(conta.id)}>
                          Confirmar
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => abrirModal(conta)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => excluirConta(conta.id)}>
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div className="px-5 pb-5">
          <Pagination page={page} totalPages={totalPaginas} onPageChange={setPage} />
          <div className="text-sm text-gray-500 mt-2">{total} registro(s) encontrado(s)</div>
        </div>
      </Card>

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
