import React, { useState } from "react";

export default function TelaMensalidade({ mensalidades, atualizarMensalidades }) {
  const [loadingId, setLoadingId] = useState(null);

  const formatValor = (valor) => {
    const num = Number(valor);
    return isNaN(num) ? "0.00" : num.toFixed(2);
  };

  async function registrarPagamento(id) {
  const confirmado = window.confirm("Confirmar pagamento desta mensalidade?");
  if (!confirmado) return;

  try {
    await fetch(`http://localhost:3001/mensalidades/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paga" }),
    });

    if (typeof atualizarMensalidades === "function") {
      await atualizarMensalidades(); // recarrega a lista
    }
  } catch (error) {
    alert("Erro ao registrar pagamento.");
  }
}

  const getBadgeClass = (status) => {
    if (status === "paga") return "bg-green-100 text-green-800";
    if (status === "pendente") return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800"; // debito ou em aberto
  };

  if (!mensalidades || mensalidades.length === 0) {
    return <p className="text-center mt-6">Nenhuma mensalidade encontrada.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto mt-6 bg-white rounded shadow overflow-x-auto">
      <h3 className="text-lg font-semibold p-4 border-b">Mensalidades</h3>
      <table className="min-w-full text-left">
        <thead className="bg-blue-600 text-white">
          <tr>
            <th className="p-3">Vencimento</th>
            <th className="p-3">Valor Cobrado</th>
            <th className="p-3">Desconto</th>
            <th className="p-3">Status</th>
            <th className="p-3">Ações</th>
          </tr>
        </thead>
        <tbody>
          {mensalidades.map(({ id, vencimento, valor_cobrado, desconto_aplicado, status }) => (
            <tr key={id} className="border-b hover:bg-gray-50">
              <td className="p-3">{new Date(vencimento).toLocaleDateString("pt-BR")}</td>
              <td className="p-3">R$ {formatValor(valor_cobrado)}</td>
              <td className="p-3">R$ {formatValor(desconto_aplicado)}</td>
              <td className="p-3">
                <span className={`px-2 py-1 rounded-full text-sm font-medium ${getBadgeClass(status)}`}>
                  {status}
                </span>
              </td>
              <td className="p-3">
                {status !== "paga" ? (
                  <button
                    onClick={() => registrarPagamento(id)}
                    disabled={loadingId === id}
                    className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {loadingId === id ? "Processando..." : "Registrar Pagamento"}
                  </button>
                ) : (
                  <span className="text-green-700 font-semibold">Pago</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
