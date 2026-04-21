import React, { useEffect, useState } from "react";
import { CalendarDays, ShoppingCart, Wallet } from "lucide-react";
import { toast } from "react-toastify";
import { createVendaProduto, fetchProdutos, fetchVendasProdutos } from "../../services/Api";
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
    } catch (e) {
      toast.error("Erro ao carregar produtos");
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
    } catch (e) {
      toast.error("Erro ao carregar vendas");
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

  async function handleVenda(e) {
    e.preventDefault();
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
    } catch (e) {
      toast.error("Erro ao registrar venda");
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vendas de Produtos"
        subtitle="Registre vendas da recepção e acompanhe o histórico operacional."
        actions={<Button onClick={() => setModalVendaAberto(true)}>+ Registrar Venda</Button>}
      />

      <div className="ui-status-grid">
        <KpiCard label="Vendas Encontradas" value={total} icon={<ShoppingCart size={20} />} tone="blue" />
        <KpiCard label="Total da Página" value={formatarMoeda(totalPagina)} icon={<Wallet size={20} />} tone="green" />
        <KpiCard label="Produtos Disponíveis" value={produtos.length} icon={<CalendarDays size={20} />} tone="gray" />
      </div>

      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Histórico de Vendas</h2>
            <p className="ui-section-subtitle">{total} registro(s) encontrado(s).</p>
          </div>
        </div>

        <div className="p-5 flex flex-wrap gap-3 items-end border-b">
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "diario", label: "Diário" },
              { key: "semanal", label: "Semanal" },
              { key: "mensal", label: "Mensal" },
              { key: "personalizado", label: "Personalizado" },
            ].map((p) => (
              <PillButton key={p.key} active={periodoRapido === p.key} onClick={() => aplicarPeriodoRapido(p.key)}>
                {p.label}
              </PillButton>
            ))}
          </div>

          <Input
            label="Data inicial"
            type="date"
            value={dataInicial}
            onChange={(e) => {
              setPeriodoRapido("personalizado");
              setDataInicial(e.target.value);
            }}
            className="max-w-44"
          />
          <Input
            label="Data final"
            type="date"
            value={dataFinal}
            onChange={(e) => {
              setPeriodoRapido("personalizado");
              setDataFinal(e.target.value);
            }}
            className="max-w-44"
          />
          <Button onClick={() => { setPagina(1); carregarVendas(); }}>Filtrar</Button>
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
              {vendas.map((v) => (
                <tr key={v.id}>
                  <td className="font-semibold">{v.produto_nome}</td>
                  <td>{v.quantidade}</td>
                  <td>{formatarMoeda(v.preco_unitario)}</td>
                  <td className="font-semibold">{formatarMoeda(Number(v.preco_unitario || 0) * Number(v.quantidade || 0))}</td>
                  <td>{new Date(v.data_venda).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div className="px-5 pb-5">
          <Pagination page={pagina} totalPages={totalPaginas} onPageChange={setPagina} />
        </div>
      </Card>

      {modalVendaAberto && (
        <Modal title="Registrar Venda" onClose={fecharModalVenda}>
          <form onSubmit={handleVenda} className="space-y-4">
            <Select
              label="Produto"
              value={produtoSelecionado?.id || ""}
              onChange={(e) => setProdutoSelecionado(produtos.find((p) => p.id === Number(e.target.value)))}
            >
              <option value="">Selecione um produto</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} - Estoque: {p.estoque}
                </option>
              ))}
            </Select>

            <Input
              label="Quantidade"
              type="number"
              value={quantidade}
              onChange={(e) => setQuantidade(Number(e.target.value))}
              min="1"
              max={produtoSelecionado?.estoque || 1}
            />

            {produtoSelecionado && (
              <div className="ui-info-item">
                <div className="ui-info-item__label">Total estimado</div>
                <div className="ui-info-item__value">
                  {formatarMoeda(Number(produtoSelecionado.preco || 0) * Number(quantidade || 0))}
                </div>
              </div>
            )}

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
