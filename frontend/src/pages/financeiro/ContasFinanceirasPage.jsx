import React, { useEffect, useMemo, useState } from "react";
import {
  deletarContaFinanceira,
  getContasFinanceiras,
  marcarComoPago,
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
    tipo: "todos",
    status: "todos",
    data_inicial: "",
    data_final: "",
    descricao: "",
  });

  async function carregar(pageParam = page) {
    setErro(null);
    try {
      const dados = await getContasFinanceiras({
        ...filtros,
        page: pageParam,
        perPage,
      });
      setContas(dados.data || []);
      setTotal(dados.total || 0);
    } catch (error) {
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

  function handleFiltro(event) {
    setFiltros((estado) => ({ ...estado, [event.target.name]: event.target.value }));
  }

  function limparFiltros() {
    setFiltros({
      tipo: "todos",
      status: "todos",
      data_inicial: "",
      data_final: "",
      descricao: "",
    });
  }

  const totalPaginas = Math.max(1, Math.ceil(total / perPage));
  const totalPagina = useMemo(
    () => contas.reduce((soma, conta) => soma + Number(conta.valor || 0), 0),
    [contas]
  );
  const pendentesPagina = useMemo(
    () => contas.filter((conta) => conta.status === "pendente").length,
    [contas]
  );

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
      <Card className="finance-filter-card">
        <div className="entity-toolbar">
          <div className="entity-toolbar__intro">
            <span className="entity-toolbar__eyebrow">Lançamentos por unidade</span>
            <div>
              <h2 className="ui-section-title">Contas financeiras</h2>
              <p className="ui-section-subtitle">Lançamentos, status de pagamento e vínculo com plano de contas.</p>
            </div>
          </div>
          <Button onClick={() => abrirModal(null)}>+ Nova Conta Financeira</Button>
        </div>

        <div className="finance-filter-bar">
          <div className="finance-filter-bar__group">
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
          </div>

          <div className="finance-filter-bar__group">
            <Input label="Data inicial" type="date" name="data_inicial" value={filtros.data_inicial} onChange={handleFiltro} />
            <Input label="Data final" type="date" name="data_final" value={filtros.data_final} onChange={handleFiltro} />
            <Button variant="ghost" onClick={limparFiltros}>Limpar Filtros</Button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="entity-summary-grid">
            <div className="finance-glass-card">
              <div className="finance-glass-card__label">Itens nesta página</div>
              <div className="finance-glass-card__value">{contas.length}</div>
              <div className="finance-glass-card__copy">Lançamentos no recorte atual da tabela.</div>
            </div>
            <div className="finance-glass-card">
              <div className="finance-glass-card__label">Valor paginado</div>
              <div className="finance-glass-card__value">{formatarMoeda(totalPagina)}</div>
              <div className="finance-glass-card__copy">Somatório visual dos itens carregados nesta página.</div>
            </div>
            <div className="finance-glass-card">
              <div className="finance-glass-card__label">Pendências na página</div>
              <div className="finance-glass-card__value">{pendentesPagina}</div>
              <div className="finance-glass-card__copy">Contas ainda não confirmadas no recorte atual.</div>
            </div>
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
                {contas.map((conta) => (
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

          <Pagination page={page} totalPages={totalPaginas} onPageChange={setPage} />
          <div className="text-sm text-slate-500">{total} registro(s) encontrado(s)</div>
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
