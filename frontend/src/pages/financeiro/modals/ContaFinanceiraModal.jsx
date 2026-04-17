import React, { useEffect, useState } from "react";
import { criarContaFinanceira } from '../../../services/contasFinanceiras';
import { getPlanoContas } from '../../../services/planoContasService';

export default function ContaFinanceiraModal({ aberto, onClose, onSalvo }) {
  const [form, setForm] = useState({
    descricao: "",
    tipo: "despesa",
    valor: "",
    data_lancamento: "",
    status: "pendente",     // Valor inicial correto
    plano_contas_id: "",
    observacao: "",
  });
  const [planos, setPlanos] = useState([]);
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setErro(null);
      setForm({
        descricao: "",
        tipo: "despesa",
        valor: "",
        data_lancamento: "",
        status: "pendente",   // Corrigido!
        plano_contas_id: "",
        observacao: "",
      });
      getPlanoContas().then(setPlanos);
    }
  }, [aberto]);

  async function salvar() {
    setErro(null);
    // Validação básica
    if (!form.descricao || !form.tipo || !form.valor || !form.data_lancamento || !form.status || !form.plano_contas_id) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      // Envia valor e plano_contas_id como number
      await criarContaFinanceira({
        ...form,
        valor: Number(form.valor),
        plano_contas_id: Number(form.plano_contas_id),
      });
      if (onSalvo) onSalvo();
      onClose();
    } catch (e) {
      setErro("Erro ao criar conta financeira");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl animate-fadeIn">
        <h2 className="text-xl font-bold mb-4">Nova Conta Financeira</h2>
        {erro && <div className="text-red-600 mb-2">{erro}</div>}

        <div className="grid grid-cols-1 gap-3">
          <input
            className="border p-2 rounded"
            placeholder="Descrição"
            value={form.descricao}
            onChange={e => setForm({ ...form, descricao: e.target.value })}
          />
          <select
            className="border p-2 rounded"
            value={form.tipo}
            onChange={e => setForm({ ...form, tipo: e.target.value })}
          >
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>
          <input
            type="number"
            className="border p-2 rounded"
            placeholder="Valor"
            value={form.valor}
            onChange={e => setForm({ ...form, valor: e.target.value })}
          />
          <input
            type="date"
            className="border p-2 rounded"
            placeholder="Data de Lançamento"
            value={form.data_lancamento}
            onChange={e => setForm({ ...form, data_lancamento: e.target.value })}
          />
          <select
            className="border p-2 rounded"
            value={form.status}
            onChange={e => setForm({ ...form, status: e.target.value })}
          >
            <option value="pendente">Pendente</option>
            <option value="pago">Pago</option>
          </select>
          <select
            className="border p-2 rounded"
            value={form.plano_contas_id}
            onChange={e => setForm({ ...form, plano_contas_id: e.target.value })}
          >
            <option value="">Selecione o Plano de Contas</option>
            {planos.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <input
            className="border p-2 rounded"
            placeholder="Observação (opcional)"
            value={form.observacao}
            onChange={e => setForm({ ...form, observacao: e.target.value })}
          />
        </div>
        <div className="flex justify-end space-x-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded border">Cancelar</button>
          <button
            onClick={salvar}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={salvando}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
