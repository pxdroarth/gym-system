import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, PackagePlus, ShieldAlert } from "lucide-react";
import { toast } from "react-toastify";
import { deleteProduto, fetchProdutos } from "../../services/produtoService";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import StockBar from "../../components/ui/StockBar";
import Table from "../../components/ui/Table";
import getApiErrorMessage from "../../utils/getApiErrorMessage";
import ProdutoForm from "./ProdutoForm";

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function estoqueBaixo(produto) {
  return Number(produto.estoque || 0) <= 10;
}

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState([]);
  const [editProduto, setEditProduto] = useState(null);
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);

  useEffect(() => {
    carregarProdutos();
  }, []);

  async function carregarProdutos() {
    try {
      const dados = await fetchProdutos();
      setProdutos(Array.isArray(dados) ? dados : []);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleDelete(id) {
    if (window.confirm("Confirma exclusão do produto?")) {
      try {
        await deleteProduto(id);
        toast.success("Produto excluído!");
        carregarProdutos();
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      }
    }
  }

  function abrirModalNovo() {
    setEditProduto(null);
    setModalProdutoAberto(true);
  }

  function abrirModalEdicao(produto) {
    setEditProduto(produto);
    setModalProdutoAberto(true);
  }

  function fecharModalProduto() {
    setEditProduto(null);
    setModalProdutoAberto(false);
  }

  const estoqueTotal = useMemo(
    () => produtos.reduce((total, produto) => total + Number(produto.estoque || 0), 0),
    [produtos]
  );
  const totalEstoqueBaixo = produtos.filter(estoqueBaixo).length;
  const estoqueMaximo = Math.max(...produtos.map((produto) => Number(produto.estoque || 0)), 1);
  const valorCatalogo = useMemo(
    () => produtos.reduce((total, produto) => total + (Number(produto.preco || 0) * Number(produto.estoque || 0)), 0),
    [produtos]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        subtitle="Catálogo operacional da unidade, criticidade de estoque e manutenção rápida de itens."
        actions={<Button onClick={abrirModalNovo}>+ Novo Produto</Button>}
      />

      <div className="ui-status-grid">
        <KpiCard label="Produtos" value={produtos.length} icon={<PackagePlus size={20} />} tone="blue" />
        <KpiCard label="Estoque total" value={estoqueTotal} icon={<Boxes size={20} />} tone="green" />
        <KpiCard label="Estoque baixo" value={totalEstoqueBaixo} icon={<AlertTriangle size={20} />} tone="amber" />
        <KpiCard label="Valor estimado" value={formatarMoeda(valorCatalogo)} icon={<ShieldAlert size={20} />} tone="gray" />
      </div>

      <Card>
        <div className="entity-toolbar">
          <div className="entity-toolbar__intro">
            <span className="entity-toolbar__eyebrow">Catálogo operacional</span>
            <div>
              <h2 className="ui-section-title">Produtos cadastrados</h2>
              <p className="ui-section-subtitle">Leitura mais clara de criticidade, preço e estoque sem alterar o fluxo atual.</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="entity-summary-grid">
            <div className="entity-summary-card">
              <div className="entity-summary-card__label">Itens ativos</div>
              <div className="entity-summary-card__value">{produtos.length}</div>
              <div className="entity-summary-card__copy">Base atual de produtos da unidade.</div>
            </div>
            <div className="entity-summary-card">
              <div className="entity-summary-card__label">Atenção de estoque</div>
              <div className="entity-summary-card__value">{totalEstoqueBaixo}</div>
              <div className="entity-summary-card__copy">Itens com baixo volume para operação.</div>
            </div>
            <div className="entity-summary-card">
              <div className="entity-summary-card__label">Disponibilidade</div>
              <div className="entity-summary-card__value">{estoqueTotal}</div>
              <div className="entity-summary-card__copy">Unidades somadas em estoque no momento.</div>
            </div>
          </div>

          {produtos.length === 0 ? (
            <EmptyState title="Nenhum produto encontrado." description="Cadastre o primeiro produto para iniciar o controle." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Preço</th>
                  <th>Estoque</th>
                  <th>Criticidade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {produtos.map((produto) => (
                  <tr key={produto.id}>
                    <td>
                      <div className="product-table__item">
                        <div className="product-thumb">
                          {produto.imagem ? (
                            <img src={`${API_URL}${produto.imagem}`} alt={produto.nome} />
                          ) : (
                            <div className="product-thumb__fallback">Sem imagem</div>
                          )}
                        </div>
                        <div className="product-table__name">
                          <span className="font-semibold">{produto.nome}</span>
                          <span className="product-table__description">{produto.descricao || "Sem descrição operacional."}</span>
                        </div>
                      </div>
                    </td>
                    <td className="font-semibold">{formatarMoeda(produto.preco)}</td>
                    <td>
                      <div className="product-stock-cell">
                        <StockBar value={produto.estoque} max={estoqueMaximo} />
                        <div className="product-stock-cell__meta">
                          <Badge tone={estoqueBaixo(produto) ? "amber" : "green"}>
                            {estoqueBaixo(produto) ? "Baixo" : "Saudável"}
                          </Badge>
                          <span className="text-xs text-slate-500">Saldo atual: {Number(produto.estoque || 0)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {estoqueBaixo(produto) ? (
                        <Badge tone="amber">Repor em breve</Badge>
                      ) : (
                        <Badge tone="green">Operação estável</Badge>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="secondary" onClick={() => abrirModalEdicao(produto)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleDelete(produto.id)}>
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {modalProdutoAberto && (
        <Modal title={editProduto ? "Editar Produto" : "Cadastrar Produto"} onClose={fecharModalProduto} className="max-w-4xl">
          <ProdutoForm
            produto={editProduto}
            onSuccess={() => {
              fecharModalProduto();
              carregarProdutos();
            }}
            onCancel={fecharModalProduto}
          />
        </Modal>
      )}
    </div>
  );
}
