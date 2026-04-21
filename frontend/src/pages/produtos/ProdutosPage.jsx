import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, PackagePlus } from "lucide-react";
import { toast } from "react-toastify";
import { deleteProduto, fetchProdutos } from "../../services/Api";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import StockBar from "../../components/ui/StockBar";
import Table from "../../components/ui/Table";
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
    } catch (e) {
      toast.error("Erro ao carregar produtos");
    }
  }

  async function handleDelete(id) {
    if (window.confirm("Confirma exclusão do produto?")) {
      try {
        await deleteProduto(id);
        toast.success("Produto excluído!");
        carregarProdutos();
      } catch (e) {
        toast.error("Erro ao excluir: " + (e.message || ""));
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
  const estoqueMaximo = Math.max(...produtos.map((p) => Number(p.estoque || 0)), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        subtitle="Catálogo de itens, preços e controle operacional de estoque."
        actions={<Button onClick={abrirModalNovo}>+ Novo Produto</Button>}
      />

      <div className="ui-status-grid">
        <KpiCard label="Produtos" value={produtos.length} icon={<PackagePlus size={20} />} tone="blue" />
        <KpiCard label="Estoque Total" value={estoqueTotal} icon={<Boxes size={20} />} tone="green" />
        <KpiCard label="Estoque Baixo" value={totalEstoqueBaixo} icon={<AlertTriangle size={20} />} tone="amber" />
      </div>

      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Produtos Cadastrados</h2>
            <p className="ui-section-subtitle">{produtos.length} item(ns) no catálogo.</p>
          </div>
        </div>

        {produtos.length === 0 ? (
          <EmptyState title="Nenhum produto encontrado." description="Cadastre o primeiro produto para iniciar o controle." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Imagem</th>
                <th>Nome</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((produto) => (
                <tr key={produto.id}>
                  <td>
                    {produto.imagem ? (
                      <img
                        src={`${API_URL}${produto.imagem}`}
                        alt={produto.nome}
                        className="w-12 h-12 object-cover rounded-lg border"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-lg border flex items-center justify-center text-gray-500 text-xs">
                        Sem imagem
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="font-semibold">{produto.nome}</div>
                    {produto.descricao && <div className="text-xs text-gray-500 mt-1">{produto.descricao}</div>}
                  </td>
                  <td className="font-semibold">{formatarMoeda(produto.preco)}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <StockBar value={produto.estoque} max={estoqueMaximo} />
                      {estoqueBaixo(produto) && <Badge tone="amber">Baixo</Badge>}
                    </div>
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
      </Card>

      {modalProdutoAberto && (
        <Modal title={editProduto ? "Editar Produto" : "Cadastrar Produto"} onClose={fecharModalProduto}>
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
