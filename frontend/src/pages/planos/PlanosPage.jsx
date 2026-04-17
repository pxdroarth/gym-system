import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import ModalPlanoForm from "./ModalPlanoForm";

export default function PlanosPage() {
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [planoEditar, setPlanoEditar] = useState(null);

  useEffect(() => {
    carregarPlanos();
  }, []);

  async function carregarPlanos() {
    setCarregando(true);
    try {
      const res = await fetch("http://localhost:3001/planos");
      const data = await res.json();
      setPlanos(data);
    } catch (err) {
      toast.error("Erro ao carregar planos");
    } finally {
      setCarregando(false);
    }
  }

  function abrirModalNovo() {
    setPlanoEditar(null);
    setMostrarModal(true);
  }

  function abrirModalEdicao(plano) {
    setPlanoEditar(plano);
    setMostrarModal(true);
  }

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded shadow space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-blue-700">Planos</h2>
        <button
          onClick={abrirModalNovo}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
        >
          + Novo Plano
        </button>
      </div>

      {carregando ? (
        <p className="text-gray-600">Carregando planos...</p>
      ) : planos.length === 0 ? (
        <p className="text-gray-600">Nenhum plano cadastrado.</p>
      ) : (
        <table className="min-w-full border text-sm mt-4">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2 border">Nome</th>
              <th className="p-2 border">Descrição</th>
              <th className="p-2 border">Valor (R$)</th>
              <th className="p-2 border">Duração</th>
              <th className="p-2 border">Tipo</th>
              <th className="p-2 border">Ações</th>
            </tr>
          </thead>
          <tbody>
            {planos.map((plano) => (
              <tr key={plano.id} className="hover:bg-gray-50">
                <td className="p-2 border">{plano.nome}</td>
                <td className="p-2 border">{plano.descricao || "-"}</td>
                <td className="p-2 border">
                  R$ {Number(plano.valor_base).toFixed(2)}
                </td>
                <td className="p-2 border">{plano.duracao_em_dias} dias</td>
                <td className="p-2 border">
                  {plano.compartilhado ? "Compartilhado" : "Individual"}
                </td>
                <td className="p-2 border text-center">
                  <button
                    onClick={() => abrirModalEdicao(plano)}
                    className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 🔹 Modal com props corretos */}
      <ModalPlanoForm
        aberto={mostrarModal}
        fechar={() => setMostrarModal(false)}
        planoEditar={planoEditar}
        aoSalvar={carregarPlanos}
      />
    </div>
  );
}
