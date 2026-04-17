import React, { useEffect, useState } from "react";
import {
  getPlanoContas,
  createPlanoConta,
  updatePlanoConta,
  deletePlanoConta,
} from '../../services/planoContasService';

export default function PlanoContasPage() {
  const [contas, setContas] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    tipo: "despesa",
    descricao: "",
    quantidade_sugerida: "",
    dia_sugerido: "",
  });
  const [editandoId, setEditandoId] = useState(null);
  const [erro, setErro] = useState(null);

  const carregarContas = async () => {
    try {
      const data = await getPlanoContas();
      setContas(data);
    } catch (e) {
      setErro("Erro ao carregar contas");
    }
  };

  useEffect(() => {
    carregarContas();
  }, []);

  const abrirModal = (conta = null) => {
    setErro(null);
    if (conta) {
      setEditandoId(conta.id);
      setForm({
        nome: conta.nome,
        tipo: conta.tipo,
        descricao: conta.descricao || "",
        quantidade_sugerida: conta.quantidade_sugerida || "",
        dia_sugerido: conta.dia_sugerido || "",
      });
    } else {
      setEditandoId(null);
      setForm({ nome: "", tipo: "despesa", descricao: "", quantidade_sugerida: "", dia_sugerido: "" });
    }
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
  };

  const salvar = async () => {
    if (!form.nome || !form.tipo) {
      setErro("Nome e tipo são obrigatórios");
      return;
    }

    try {
      if (editandoId) {
        await updatePlanoConta(editandoId, form);
      } else {
        await createPlanoConta(form);
      }
      fecharModal();
      carregarContas();
    } catch (e) {
      setErro("Erro ao salvar conta");
    }
  };

  const remover = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir?")) return;
    try {
      await deletePlanoConta(id);
      carregarContas();
    } catch (e) {
      alert("Erro ao excluir");
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-blue-800">Plano de Contas</h2>
        <button
          onClick={() => abrirModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
        >
          + Nova Conta
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded shadow">
          <thead>
            <tr className="bg-gray-200 text-left">
              <th className="p-3">Nome</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Descrição</th>
              <th className="p-3">Qtde Sug.</th>
              <th className="p-3">Dia Sug.</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {contas.map((conta) => (
              <tr key={conta.id} className="border-t">
                <td className="p-3">{conta.nome}</td>
                <td className="p-3 capitalize">{conta.tipo}</td>
                <td className="p-3 text-sm">{conta.descricao}</td>
                <td className="p-3">{conta.quantidade_sugerida || "-"}</td>
                <td className="p-3">{conta.dia_sugerido || "-"}</td>
                <td className="p-3 space-x-2">
                  <button onClick={() => abrirModal(conta)} className="text-blue-600 hover:underline text-sm">
                    Editar
                  </button>
                  <button onClick={() => remover(conta.id)} className="text-red-600 hover:underline text-sm">
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg animate-fadeIn">
            <h3 className="text-lg font-bold mb-4">{editandoId ? "Editar" : "Nova"} Conta</h3>

            {erro && <p className="text-red-600 text-sm mb-2">{erro}</p>}

            <div className="grid grid-cols-1 gap-3">
              <input
                type="text"
                placeholder="Nome"
                className="border p-2 rounded"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
              <select
                className="border p-2 rounded"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
              <textarea
                placeholder="Descrição"
                className="border p-2 rounded"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
              <input
                type="number"
                placeholder="Quantidade sugerida (opcional)"
                className="border p-2 rounded"
                value={form.quantidade_sugerida}
                onChange={(e) => setForm({ ...form, quantidade_sugerida: e.target.value })}
              />
              <input
                type="number"
                placeholder="Dia sugerido (1-31, opcional)"
                className="border p-2 rounded"
                value={form.dia_sugerido}
                onChange={(e) => setForm({ ...form, dia_sugerido: e.target.value })}
              />
            </div>

            <div className="flex justify-end space-x-2 mt-4">
              <button onClick={fecharModal} className="px-4 py-2 rounded border">Cancelar</button>
              <button onClick={salvar} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
