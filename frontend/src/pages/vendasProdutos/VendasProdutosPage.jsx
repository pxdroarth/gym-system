import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, PackageCheck, ShoppingCart, Wallet } from "lucide-react";
import { toast } from "react-toastify";
import { fetchProdutos } from "../../services/produtoService";
import { createVendaProduto, fetchVendasProdutos } from "../../services/vendaProdutoService";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import KpiCard from "../../components/ui/KpiCard";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import PillButton from "../../components/ui/PillButton";
import Select from "../../components/ui/Select";
import Table from "../../components/ui/Table";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function periodoParaDatas(periodo) {
  const hoje = new Date();
  const fim = hoje.toISOString().slice(0, 10);
  const inicio = new Date(hoje);

  if (periodo === "diario") return { inicio: fim, fim };
  if (periodo === "semanal") inicio.setDate(hoje.getDate() - 7);
  if (periodo === "mensal") inicio.setMonth(hoje.getMonth() - 1);

  return { inicio: inicio.toISOString().slice(0, 10), fim };
}

export default function VendasProdutosPage() {
  const [produtos, setProdutos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [total, setTotal] = useState(0);

  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [registrandoVenda, setRegistrandoVenda] = useState(false);
  const [modalVendaAberto, setModalVendaAberto] = useState(false);

  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [periodoRapido, setPeriodoRapido] = useState("personalizado");

  const [pagina, setPagina] = useState(1);
  const limite = 10;

  useEffect(() => {
    carregarProdutos();
    carregarVendas();
  }, [pagina, dataInicial, dataFinal]);

  async function carregarProdutos() {
    try {
      const dados = await fetchProdutos();
      setProdutos(dados);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function carregarVendas() {
    try {
      const { vendas: vendasLista, total: totalVendas } = await fetchVendasProdutos({
        data_inicial: dataInicial,
        data_final: dataFinal,
        pagina,
        limite,
      });
      setVendas(vendasLista);
      setTotal(totalVendas);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  function resetVenda() {
    setQuantidade(1);
    setProdutoSelecionado(null);
  }

  function fecharModalVenda() {
    resetVenda();
    setModalVendaAberto(false);
  }

  async function handleVenda(event) {
    event.preventDefault();
    if (!produtoSelecionado) return toast.error("Selecione um produto.");
    if (quantidade <= 0) return toast.error("Quantidade deve ser maior que zero.");
    if (quantidade > produtoSelecionado.estoque) return toast.error("Quantidade maior que o estoque disponível.");

    try {
      setRegistrandoVenda(true);
      await createVendaProduto({
        produto_id: produtoSelecionado.id,
        quantidade,
        preco_unitario: Number(produtoSelecionado.preco),
      });
      toast.success("Venda registrada com sucesso!");
      fecharModalVenda();
      carregarProdutos();
      carregarVendas();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setRegistrandoVenda(false);
    }
  }

  function aplicarPeriodoRapido(periodo) {
    setPeriodoRapido(periodo);
    setPagina(1);

    if (periodo === "personalizado") return;

    const datas = periodoParaDatas(periodo);
    setDataInicial(datas.inicio);
    setDataFinal(datas.fim);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const totalPagina = vendas.reduce((soma, venda) => soma + Number(venda.preco_unitario || 0) * Number(venda.quantidade || 0), 0);
  const ticketMedio = vendas.length > 0 ? totalPagina / vendas.length : 0;
  const produtosDisponiveis = useMemo(
    () => produtos.filter((produto) => Number(produto.estoque || 0) > 0).length,
    [produtos]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas de Produtos"
        subtitle="Registre vendas da recepção e acompanhe o histórico operacional da unidade."
        actions={<Button onClick={() => setModalVendaAberto(true)}>+ Registrar Venda</Button>}
      />

      <div className="ui-status-grid">
        <KpiCard label="Vendas Encontradas" value={total} icon={<ShoppingCart size={20} />} tone="blue" />
        <KpiCard label="Total da Página" value={formatarMoeda(totalPagina)} icon={<Wallet size={20} />} tone="green" />
        <KpiCard label="Ticket Médio" value={formatarMoeda(ticketMedio)} icon={<CalendarDays size={20} />} tone="amber" />
        <KpiCard label="Produtos Disponíveis" value={produtosDisponiveis} icon={<PackageCheck size={20} />} tone="gray" />
      </div>

      <Card>
        <div className="entity-toolbar">
          <div className="entity-toolbar__intro">
            <span className="entity-toolbar__eyebrow">Fluxo comercial</span>
            <div>
              <h2 className="ui-section-title">Histórico de vendas</h2>
              <p className="ui-section-subtitle">Filtros mais claros e leitura operacional refinada sem mudar payload ou paginação.</p>
            </div>
          </div>
        </div>

        <div className="sales-filter-bar">
          <div className="sales-filter-bar__group">
            {[
              { key: "diario", label: "Diário" },
              { key: "semanal", label: "Semanal" },
              { key: "mensal", label: "Mensal" },
              { key: "personalizado", label: "Personalizado" },
            ].map((periodo) => (
              <PillButton key={periodo.key} active={periodoRapido === periodo.key} onClick={() => aplicarPeriodoRapido(periodo.key)}>
                {periodo.label}
              </PillButton>
            ))}
          </div>

          <div className="sales-filter-bar__group">
            <Input
              label="Data inicial"
              type="date"
              value={dataInicial}
              onChange={(event) => {
                setPeriodoRapido("personalizado");
                setDataInicial(event.target.value);
              }}
              className="max-w-44"
            />
            <Input
              label="Data final"
              type="date"
              value={dataFinal}
              onChange={(event) => {
                setPeriodoRapido("personalizado");
                setDataFinal(event.target.value);
              }}
              className="max-w-44"
            />
            <Button onClick={() => { setPagina(1); carregarVendas(); }}>Filtrar</Button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="sales-kpi-grid">
            <div className="sales-quick-card">
              <div className="sales-quick-card__label">Período ativo</div>
              <div className="sales-quick-card__value">{periodoRapido === "personalizado" ? "Customizado" : periodoRapido}</div>
              <div className="sales-quick-card__copy">Recorte aplicado na busca atual de vendas.</div>
            </div>
            <div className="sales-quick-card">
              <div className="sales-quick-card__label">Volume paginado</div>
              <div className="sales-quick-card__value">{vendas.length}</div>
              <div className="sales-quick-card__copy">Itens exibidos na página atual.</div>
            </div>
            <div className="sales-quick-card">
              <div className="sales-quick-card__label">Produtos ativos</div>
              <div className="sales-quick-card__value">{produtosDisponiveis}</div>
              <div className="sales-quick-card__copy">Produtos com estoque acima de zero.</div>
            </div>
          </div>

          {vendas.length === 0 ? (
            <EmptyState title="Nenhuma venda encontrada." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Quantidade</th>
                  <th>Preço Unitário</th>
                  <th>Total</th>
                  <th>Data Venda</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((venda) => (
                  <tr key={venda.id}>
                    <td className="font-semibold">{venda.produto_nome}</td>
                    <td>{venda.quantidade}</td>
                    <td>{formatarMoeda(venda.preco_unitario)}</td>
                    <td className="font-semibold">{formatarMoeda(Number(venda.preco_unitario || 0) * Number(venda.quantidade || 0))}</td>
                    <td>{new Date(venda.data_venda).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
        </div>
      </Card>

      {modalVendaAberto && (
        <Modal title="Registrar Venda" onClose={fecharModalVenda} className="max-w-4xl">
          <form onSubmit={handleVenda} className="space-y-4">
            <div className="sales-modal-grid">
              <div className="sales-modal-panel">
                <h3 className="sales-modal-panel__title">Seleção do produto</h3>
                <p className="sales-modal-panel__copy">O fluxo permanece igual: produto, quantidade, validação de estoque e envio com createVendaProduto.</p>

                <div className="space-y-4 mt-4">
                  <Select
                    label="Produto"
                    value={produtoSelecionado?.id || ""}
                    onChange={(event) => setProdutoSelecionado(produtos.find((produto) => produto.id === Number(event.target.value)))}
                  >
                    <option value="">Selecione um produto</option>
                    {produtos.map((produto) => (
                      <option key={produto.id} value={produto.id}>
                        {produto.nome} - Estoque: {produto.estoque}
                      </option>
                    ))}
                  </Select>

                  <Input
                    label="Quantidade"
                    type="number"
                    value={quantidade}
                    onChange={(event) => setQuantidade(Number(event.target.value))}
                    min="1"
                    max={produtoSelecionado?.estoque || 1}
                  />
                </div>
              </div>

              <div className="sales-modal-panel">
                <h3 className="sales-modal-panel__title">Resumo rápido</h3>
                <p className="sales-modal-panel__copy">Apoio visual para registrar a venda com mais confiança na operação.</p>

                <div className="sales-modal-summary mt-4">
                  <div className="sales-modal-summary__item">
                    <div className="sales-modal-summary__label">Produto</div>
                    <div className="sales-modal-summary__value">{produtoSelecionado?.nome || "Aguardando seleção"}</div>
                  </div>
                  <div className="sales-modal-summary__item">
                    <div className="sales-modal-summary__label">Estoque disponível</div>
                    <div className="sales-modal-summary__value">{produtoSelecionado?.estoque ?? "-"}</div>
                  </div>
                  <div className="sales-modal-summary__item">
                    <div className="sales-modal-summary__label">Total estimado</div>
                    <div className="sales-modal-summary__value">
                      {formatarMoeda(Number(produtoSelecionado?.preco || 0) * Number(quantidade || 0))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="ghost" onClick={fecharModalVenda}>
                Cancelar
              </Button>
              <Button type="submit" disabled={registrandoVenda}>
                {registrandoVenda ? "Registrando..." : "Registrar Venda"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
