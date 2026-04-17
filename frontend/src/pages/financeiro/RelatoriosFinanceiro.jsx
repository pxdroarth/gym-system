import React from "react";

export default function RelatoriosFinanceiro({ dadosMensalidades, dadosVendas }) {
  return (
    <div>
      {dadosMensalidades && dadosMensalidades.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mb-2">Mensalidades</h3>
          <table className="min-w-full border mb-6">
            <thead className="bg-gray-200">
              <tr>
                <th className="border p-2">Data Vencimento</th>
                <th className="border p-2">Valor</th>
                <th className="border p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {dadosMensalidades.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="p-2 border">{m.vencimento}</td>
                  <td className="p-2 border">R$ {m.valor_cobrado.toFixed(2)}</td>
                  <td className="p-2 border">{m.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {dadosVendas && dadosVendas.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mb-2">Vendas</h3>
          <table className="min-w-full border">
            <thead className="bg-gray-200">
              <tr>
                <th className="border p-2">Data Venda</th>
                <th className="border p-2">Produto</th>
                <th className="border p-2">Quantidade</th>
                <th className="border p-2">Valor Unitário</th>
              </tr>
            </thead>
            <tbody>
              {dadosVendas.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="p-2 border">{new Date(v.data_venda).toLocaleDateString()}</td>
                  <td className="p-2 border">{v.produto_nome}</td>
                  <td className="p-2 border">{v.quantidade}</td>
                  <td className="p-2 border">R$ {v.preco_unitario.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
