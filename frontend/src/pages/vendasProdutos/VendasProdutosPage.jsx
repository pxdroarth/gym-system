import React, { useEffect, useMemo, useRef, useState } from "react";
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
import MovementChart from "../../components/ui/MovementChart";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import PillButton from "../../components/ui/PillButton";
import Select from "../../components/ui/Select";
import Table from "../../components/ui/Table";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import useAuth from "../../hooks/useAuth";
import { falhaSemConfirmacao } from "../../utils/tentativaPagamento";
import { UI_PERMISSIONS, userHasUiPermission } from "../../utils/permissions";
import { EstornoBadge, EstornoVendaModal, usePermissoesEstorno } from "../../components/vendas/EstornoVenda";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function valorBruto(venda) {
  return Number(venda.valor_total ?? venda.preco_unitario * venda.quantidade);
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
  const { user, currentUnit } = useAuth();
  const podeVender = userHasUiPermission(user, UI_PERMISSIONS.VENDAS_REGISTRAR);
  const permEstorno = usePermissoesEstorno();
  const [vendaEstorno, setVendaEstorno] = useState(null);
  const tentativas = useRef(new Map());
  const [produtos, setProdutos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [total, setTotal] = useState(0);
  const [carregandoVendas, setCarregandoVendas] = useState(true);
  const buscaVendas = useRef(0);

  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [registrandoVenda, setRegistrandoVenda] = useState(false);
  const [modalVendaAberto, setModalVendaAberto] = useState(false);

  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [recorte, setRecorte] = useState({ inicio: "", fim: "" });
  const [periodoRapido, setPeriodoRapido] = useState("personalizado");

  const [pagina, setPagina] = useState(1);
  const limite = 10;

  useEffect(() => {
    carregarProdutos();
  }, [currentUnit?.id]);

  useEffect(() => {
    carregarVendas();
    return () => { buscaVendas.current += 1; };
  }, [pagina, recorte, currentUnit?.id]);

  async function carregarProdutos() {
    try {
      const dados = await fetchProdutos();
      setProdutos(dados);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function carregarVendas() {
    const busca = ++buscaVendas.current;
    setCarregandoVendas(true);
    try {
      const { vendas: vendasLista, total: totalVendas } = await fetchVendasProdutos({
        data_inicial: recorte.inicio,
        data_final: recorte.fim,
        pagina,
        limite,
      });
      if (busca === buscaVendas.current) {
        setVendas(vendasLista);
        setTotal(totalVendas);
      }
    } catch (error) {
      if (busca === buscaVendas.current) {
        setVendas([]);
        setTotal(0);
        toast.error(getApiErrorMessage(error));
      }
    } finally {
      if (busca === buscaVendas.current) setCarregandoVendas(false);
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
    if (!podeVender || !currentUnit?.id || registrandoVenda) return;
    if (!produtoSelecionado) return toast.error("Selecione um produto.");
    if (quantidade <= 0) return toast.error("Quantidade deve ser maior que zero.");
    const registro = `gs.venda.${user?.id}.${currentUnit?.id}.${produtoSelecionado.id}.${quantidade}`;
    let tentativa = tentativas.current.get(registro);
    if (!tentativa) {
      try {
        tentativa = JSON.parse(sessionStorage.getItem(registro));
      } catch {
        // A tentativa continua disponível em memória se o storage estiver indisponível.
      }
    }
    if (!tentativa && quantidade > produtoSelecionado.estoque) {
      return toast.error("Quantidade maior que o estoque disponível.");
    }

    try {
      setRegistrandoVenda(true);
      tentativa ??= {
        chave: Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""),
        payload: {
          produto_id: produtoSelecionado.id,
          quantidade,
          preco_unitario: Number(produtoSelecionado.preco),
        },
      };
      tentativas.current.set(registro, tentativa);
      try { sessionStorage.setItem(registro, JSON.stringify(tentativa)); } catch { /* storage opcional */ }
      await createVendaProduto(tentativa.payload, tentativa.chave, currentUnit.id);
      toast.success("Venda registrada com sucesso!");
      fecharModalVenda();
      carregarProdutos();
      carregarVendas();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      if (falhaSemConfirmacao(error) || error.response?.status === 408) return;
    } finally {
      setRegistrandoVenda(false);
    }
    tentativas.current.delete(registro);
    try { sessionStorage.removeItem(registro); } catch { /* storage opcional */ }
  }

  function aplicarPeriodoRapido(periodo) {
    setPeriodoRapido(periodo);
    setPagina(1);

    if (periodo === "personalizado") return;

    const datas = periodoParaDatas(periodo);
    setDataInicial(datas.inicio);
    setDataFinal(datas.fim);
    setRecorte(datas);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / limite));
  const totalPagina = vendas.reduce((soma, venda) => soma + valorBruto(venda), 0);
  const ticketMedio = vendas.length > 0 ? totalPagina / vendas.length : 0;
  const formatDate = (date) => date.split("-").reverse().join("/");
  const periodLabel = recorte.inicio && recorte.fim ? `${formatDate(recorte.inicio)} a ${formatDate(recorte.fim)}`
    : recorte.inicio ? `Desde ${formatDate(recorte.inicio)}`
      : recorte.fim ? `Até ${formatDate(recorte.fim)}` : "Todo o histórico";
  const pageSeries = new Map();
  for (const venda of vendas) {
    const day = venda.data_venda.slice(0, 10);
    pageSeries.set(day, (pageSeries.get(day) ?? 0) + valorBruto(venda));
  }
  const produtosDisponiveis = useMemo(
    () => produtos.filter((produto) => Number(produto.estoque || 0) > 0).length,
    [produtos]
  );

  return (
    <div className="gym-module">
      <PageHeader
        title="Vendas de Produtos"
        subtitle={currentUnit?.nome}
        actions={podeVender && <Button onClick={() => setModalVendaAberto(true)}>+ Registrar Venda</Button>}
      />

      <div className="ui-status-grid">
        <KpiCard label="Vendas no recorte" subtitle={periodLabel} value={carregandoVendas ? "—" : total} icon={<ShoppingCart size={20} />} tone="blue" />
        <KpiCard label="Total bruto da página" subtitle={`Página ${pagina}`} value={carregandoVendas ? "—" : formatarMoeda(totalPagina)} icon={<Wallet size={20} />} tone="green" />
        <KpiCard label="Ticket médio bruto" subtitle={`Página ${pagina}`} value={carregandoVendas ? "—" : formatarMoeda(ticketMedio)} icon={<CalendarDays size={20} />} tone="amber" />
        <KpiCard label="Produtos disponíveis" subtitle="Estoque atual" value={produtosDisponiveis} icon={<PackageCheck size={20} />} tone="gray" />
      </div>

      <Card>
        <div className="entity-toolbar">
          <div className="entity-toolbar__intro">
            <div>
              <h2 className="ui-section-title">Histórico de vendas</h2>
              <p className="ui-section-subtitle">Vendas registradas e situação dos estornos.</p>
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
            <Button disabled={Boolean(dataInicial && dataFinal && dataInicial > dataFinal)}
              onClick={() => { setPagina(1); setRecorte({ inicio: dataInicial, fim: dataFinal }); }}>Filtrar</Button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {carregandoVendas ? <p role="status">Carregando vendas…</p> : vendas.length === 0 ? (
            <EmptyState title="Nenhuma venda encontrada." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Estorno</th>
                  <th>Quantidade</th>
                  <th>Preço Unitário</th>
                  <th>Total</th>
                  <th>Data Venda</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((venda) => (
                  <tr key={venda.id} data-venda-id={venda.id}>
                    <td className="font-semibold">{venda.produto_nome}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <EstornoBadge status={venda.estorno_status} />
                        {permEstorno.algum && <Button size="sm" variant="secondary" onClick={() => setVendaEstorno(venda)}>Estorno</Button>}
                      </div>
                    </td>
                    <td>{venda.quantidade}</td>
                    <td>{formatarMoeda(venda.preco_unitario)}</td>
                    <td className="font-semibold">{formatarMoeda(valorBruto(venda))}</td>
                    <td>{new Date(venda.data_venda).toLocaleString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
        </div>
      </Card>

      {!carregandoVendas && vendas.length > 0 && <Card className="gym-panel">
        <div className="gym-panel__head"><div><h2 className="ui-section-title">Valor bruto das vendas da página {pagina}</h2>
          <p>{periodLabel} · {vendas.length} de {total} vendas no recorte</p></div></div>
        <MovementChart title={`Valor bruto das vendas da página ${pagina} por data`} format={formatarMoeda}
          data={[...pageSeries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, sales]) => ({ label: day.split("-").reverse().join("/"), sales }))}
          bars={[{ key: "sales", label: "Vendas brutas" }]} />
      </Card>}

      {vendaEstorno && (
        <EstornoVendaModal
          venda={vendaEstorno}
          onClose={() => setVendaEstorno(null)}
          onChanged={() => { carregarVendas(); carregarProdutos(); }}
        />
      )}

      {modalVendaAberto && (
        <Modal title="Registrar Venda" onClose={fecharModalVenda} className="gym-sale-modal">
          <form onSubmit={handleVenda} className="space-y-4">
            <Select
              label="Produto"
              value={produtoSelecionado?.id || ""}
              onChange={(event) => setProdutoSelecionado(produtos.find((produto) => produto.id === Number(event.target.value)))}
            >
              <option value="">Selecione um produto</option>
              {produtos.map((produto) => (
                <option key={produto.id} value={produto.id}>{produto.nome} · estoque {produto.estoque}</option>
              ))}
            </Select>
            <Input label="Quantidade" type="number" value={quantidade}
              onChange={(event) => setQuantidade(Number(event.target.value))} min="1" />
            {produtoSelecionado && <dl className="gym-sale-summary">
              <div><dt>Preço unitário</dt><dd>{formatarMoeda(produtoSelecionado.preco)}</dd></div>
              <div><dt>Total estimado</dt><dd>{formatarMoeda(Number(produtoSelecionado.preco) * Number(quantidade || 0))}</dd></div>
            </dl>}

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
