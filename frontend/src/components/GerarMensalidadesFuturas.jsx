import React, { useState } from "react";

export default function GerarMensalidadesFuturas({ alunoId, planoId, onGerar }) {
  const [meses, setMeses] = useState(3);
  const [mensagem, setMensagem] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleGerar() {
    setMensagem(null);

    if (!meses || meses < 1) {
      setMensagem("Informe um número válido de meses.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/mensalidades/gerar-futuras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alunoId, planoId, meses }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro desconhecido");
      }

      const data = await res.json();
      setMensagem(data.message);

      if (onGerar) onGerar(); // Atualiza lista no componente pai
    } catch (error) {
      setMensagem(`Erro: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md p-4 border rounded shadow bg-white mt-6">
      <h3 className="text-lg font-bold mb-2">Gerar Mensalidades Futuras</h3>

      <label className="block mb-2 font-semibold">
        Quantidade de meses:
        <input
          type="number"
          min="1"
          value={meses}
          onChange={(e) => setMeses(Number(e.target.value))}
          className="ml-2 border px-2 py-1 rounded w-20"
          disabled={loading}
        />
      </label>

      {mensagem && (
        <p
          className={`p-2 rounded ${
            mensagem.startsWith("Erro") ? "bg-red-200 text-red-800" : "bg-green-200 text-green-800"
          }`}
        >
          {mensagem}
        </p>
      )}

      <button
        onClick={handleGerar}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Gerando..." : "Gerar Mensalidades"}
      </button>
    </div>
  );
}
