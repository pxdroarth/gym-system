import React, { useEffect, useState } from "react";
import { fetchProdutos, fetchVendasProdutos, createVendaProduto } from "../../services/Api";
import { toast } from "react-toastify";

export default function VendasProdutosPage() {
  const [produtos, setProdutos] = useState([]);
  const [vendas, setVendas] = useState([]);
  const [total, setTotal] = useState(0);

  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState(1);

  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");

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
      const params = new URLSearchParams();
      if (dataInicial) params.append("data_inicial", dataInicial);
      if (dataFinal) params.append("data_final", dataFinal);
      params.append("pagina", pagina);
      params.append("limite", limite);

      const { vendas: vendasLista, total: totalVendas } = await fetchVendasProdutos(params.toString());
      setVendas(vendasLista);
      setTotal(totalVendas);
    } catch (e) {
      toast.error("Erro ao carregar vendas");
    }
  }

  async function handleVenda(e) {
    e.preventDefault();
    if (!produtoSelecionado) return toast.error("Selecione um produto.");
    if (quantidade <= 0) return toast.error("Quantidade deve ser maior que zero.");
    if (quantidade > produtoSelecionado.estoque) return toast.error("Quantidade maior que o estoque disponível.");

    try {
      await createVendaProduto({
        produto_id: produtoSelecionado.id,
        quantidade,
        preco_unitario: Number(produtoSelecionado.preco),
      });
      toast.success("Venda registrada com sucesso!");
      setQuantidade(1);
      setProdutoSelecionado(null);
      carregarProdutos();
      carregarVendas();
    } catch (e) {
      toast.error("Erro ao registrar venda");
    }
  }

  const totalPaginas = Math.ceil(total / limite);

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded shadow space-y-6">
      <h2 className="text-2xl font-bold text-blue-700">Vendas de Produtos</h2>

      <form onSubmit={handleVenda} className="space-y-4 max-w-md">
        <select
          value={produtoSelecionado?.id || ""}
          onChange={(e) => setProdutoSelecionado(produtos.find(p => p.id === Number(e.target.value)))}
          className="w-full border px-3 py-2 rounded"
        >
          <option value="">Selecione um produto</option>
          {produtos.map(p => (
            <option key={p.id} value={p.id}>{p.nome} (Estoque: {p.estoque})</option>
          ))}
        </select>

        <input
          type="number"
          value={quantidade}
          onChange={(e) => setQuantidade(Number(e.target.value))}
          className="w-full border px-3 py-2 rounded"
          placeholder="Quantidade"
          min="1"
          max={produtoSelecionado?.estoque || 1}
        />

        <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700" type="submit">
          Registrar Venda
        </button>
      </form>

      <div className="flex gap-4 mt-4">
        <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)} className="border px-3 py-2 rounded" />
        <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)} className="border px-3 py-2 rounded" />
        <button onClick={() => { setPagina(1); carregarVendas(); }} className="px-3 py-2 bg-blue-500 text-white rounded">Filtrar</button>
      </div>

      <table className="min-w-full border mt-4">
        <thead className="bg-gray-200">
          <tr>
            <th className="p-3 border">Produto</th>
            <th className="p-3 border">Quantidade</th>
            <th className="p-3 border">Preço Unitário</th>
            <th className="p-3 border">Data Venda</th>
          </tr>
        </thead>
        <tbody>
          {vendas.map(v => (
            <tr key={v.id} className="border-t">
              <td className="p-3 border">{v.produto_nome}</td>
              <td className="p-3 border">{v.quantidade}</td>
              <td className="p-3 border">R$ {Number(v.preco_unitario).toFixed(2)}</td>
              <td className="p-3 border">{new Date(v.data_venda).toLocaleString("pt-BR")}</td>
            </tr>
          ))}
          {vendas.length === 0 && (
            <tr><td colSpan="4" className="text-center p-4">Nenhuma venda encontrada.</td></tr>
          )}
        </tbody>
      </table>

      <div className="flex gap-2 justify-center mt-4">
        {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(num => (
          <button
            key={num}
            onClick={() => setPagina(num)}
            className={`px-3 py-1 rounded ${num === pagina ? "bg-blue-600 text-white" : "bg-gray-200"}`}
          >
            {num}
          </button>
        ))}
      </div>
    </div>
  );
}
