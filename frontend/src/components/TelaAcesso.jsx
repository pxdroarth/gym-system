import React from "react";

export default function TelaAcesso({ acessos }) {
  if (!acessos || acessos.length === 0) {
    return <p className="text-center mt-6">Nenhum acesso encontrado.</p>;
  }

  // Ordena do mais recente para o mais antigo
  const acessosOrdenados = [...acessos].sort(
    (a, b) => new Date(b.data_hora) - new Date(a.data_hora)
  );

  return (
    <div className="max-w-4xl mx-auto mt-6 bg-white rounded shadow overflow-x-auto">
      <h3 className="text-lg font-semibold p-4 border-b">Histórico de Acessos</h3>
      <table className="min-w-full text-left">
        <thead className="bg-blue-600 text-white">
          <tr>
            <th className="p-3">Data/Hora</th>
            <th className="p-3">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {acessosOrdenados.map(({ id, data_hora, resultado }) => (
            <tr key={id} className="border-b hover:bg-gray-50">
              <td className="p-3">
                {new Date(data_hora).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </td>
              <td className="p-3">
                <span
                  className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                    resultado === "liberado"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {resultado === "liberado" ? "✅ Permitido" : "❌ Negado"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
