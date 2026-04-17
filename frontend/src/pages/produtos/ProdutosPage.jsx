import React, { useEffect, useState } from "react";
import { fetchProdutos, deleteProduto } from "../../services/Api";
import ProdutoForm from "./ProdutoForm";
import { toast } from "react-toastify";

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState([]);
  const [editProduto, setEditProduto] = useState(null);

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

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded shadow space-y-6">
      <h2 className="text-2xl font-bold text-blue-700">Produtos</h2>

      <ProdutoForm
        produto={editProduto}
        onSuccess={() => {
          setEditProduto(null);
          carregarProdutos();
        }}
        onCancel={() => setEditProduto(null)}
      />

      <table className="min-w-full border mt-6">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-3 border">Imagem</th>
            <th className="p-3 border">Nome</th>
            <th className="p-3 border">Preço</th>
            <th className="p-3 border">Estoque</th>
            <th className="p-3 border">Ações</th>
          </tr>
        </thead>
        <tbody>
          {produtos.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-3 text-center">Nenhum produto encontrado.</td>
            </tr>
          ) : (
            produtos.map((produto) => (
              <tr key={produto.id} className="border-t">
                <td className="p-2 border">
                  {produto.imagem ? (
                    <img
                      src={`http://localhost:3001${produto.imagem}`}
                      alt={produto.nome}
                      className="w-16 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-gray-500">
                      Sem imagem
                    </div>
                  )}
                </td>
                <td className="p-3 border">{produto.nome}</td>
                <td className="p-3 border">R$ {parseFloat(produto.preco || 0).toFixed(2)}</td>
                <td className="p-3 border">{produto.estoque}</td>
                <td className="p-3 border space-x-2">
                  <button
                    onClick={() => setEditProduto(produto)}
                    className="bg-yellow-400 px-3 py-1 rounded hover:bg-yellow-500"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(produto.id)}
                    className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700"
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
  );
}
