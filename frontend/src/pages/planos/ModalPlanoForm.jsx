import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";

export default function ModalPlanoForm({ open, onClose, planoEdicao, onSalvar }) {
  const [form, setForm] = useState({
    nome: "",
    valor_base: "",
    descricao: "",
    duracao_em_dias: "",
    compartilhado: false,
  });
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (planoEdicao) {
      setForm({
        nome: planoEdicao.nome || "",
        valor_base: planoEdicao.valor_base || "",
        descricao: planoEdicao.descricao || "",
        duracao_em_dias: planoEdicao.duracao_em_dias || "",
        compartilhado: !!planoEdicao.compartilhado,
      });
    } else {
      setForm({
        nome: "",
        valor_base: "",
        descricao: "",
        duracao_em_dias: "",
        compartilhado: false,
      });
    }
  }, [planoEdicao]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome || !form.valor_base || !form.duracao_em_dias) {
      return toast.error("Preencha todos os campos obrigatórios.");
    }
    setCarregando(true);
    try {
      const metodo = planoEdicao ? "PUT" : "POST";
      const url = planoEdicao
        ? `http://localhost:3001/planos/${planoEdicao.id}`
        : "http://localhost:3001/planos";

      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Erro ao salvar plano");

      toast.success("Plano salvo com sucesso!");
      if (onSalvar) onSalvar();
      if (onClose) onClose();
    } catch (error) {
      toast.error(error.message || "Erro ao salvar plano");
    } finally {
      setCarregando(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-md p-6 rounded shadow-lg">
        <h2 className="text-xl font-bold mb-4 text-blue-700">
          {planoEdicao ? "Editar Plano" : "Novo Plano"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-semibold">Nome:</label>
            <input
              name="nome"
              value={form.nome}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="font-semibold">Valor Base (R$):</label>
            <input
              name="valor_base"
              type="number"
              step="0.01"
              value={form.valor_base}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="font-semibold">Duração (dias):</label>
            <input
              name="duracao_em_dias"
              type="number"
              value={form.duracao_em_dias}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
              required
            />
          </div>

          <div>
            <label className="font-semibold">Descrição (opcional):</label>
            <textarea
              name="descricao"
              value={form.descricao}
              onChange={handleChange}
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              name="compartilhado"
              checked={form.compartilhado}
              onChange={handleChange}
            />
            <label className="font-semibold">Plano Compartilhado?</label>
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="border px-4 py-2 rounded text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={carregando}
              className={`px-4 py-2 rounded text-white font-bold ${
                carregando ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {carregando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
