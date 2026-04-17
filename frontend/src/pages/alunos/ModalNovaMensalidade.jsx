import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { cadastrarMensalidade } from '../../services/Api';

function sugerirVencimento(diaVencimento) {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const dia = Number(diaVencimento || hoje.getDate());

  const data = new Date(ano, mes, dia);
  if (data < hoje) {
    data.setMonth(data.getMonth() + 1);
  }

  return data.toISOString().slice(0, 10);
}

export default function ModalNovaMensalidade({ open, aluno, onClose, onSuccess }) {
  const vencimentoPadrao = useMemo(() => sugerirVencimento(aluno?.dia_vencimento), [aluno]);
  const [form, setForm] = useState({
    vencimento: vencimentoPadrao,
    valor_cobrado: '',
    desconto_aplicado: 0,
    observacoes: '',
  });
  const [carregando, setCarregando] = useState(false);

  if (!open || !aluno) return null;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setCarregando(true);
    try {
      await cadastrarMensalidade({
        aluno_id: aluno.id,
        plano_id: aluno.plano_id,
        vencimento: form.vencimento,
        valor_cobrado: form.valor_cobrado ? Number(form.valor_cobrado) : undefined,
        desconto_aplicado: Number(form.desconto_aplicado || 0),
        observacoes: form.observacoes,
      });

      toast.success('Mensalidade registrada com sucesso!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.error || err.message || 'Erro ao registrar mensalidade');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <h2 className="text-lg font-bold mb-4 text-gray-800">Registrar Mensalidade de {aluno.nome}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="font-semibold">Vencimento:</label>
            <input type="date" name="vencimento" value={form.vencimento} onChange={handleChange} required className="w-full border rounded px-4 py-2" />
          </div>
          <div>
            <label className="font-semibold">Valor (opcional):</label>
            <input type="number" name="valor_cobrado" value={form.valor_cobrado} onChange={handleChange} step="0.01" className="w-full border rounded px-4 py-2" />
            <p className="text-xs text-gray-500 mt-1">Se deixar em branco, o sistema usa o valor base do plano.</p>
          </div>
          <div>
            <label className="font-semibold">Desconto:</label>
            <input type="number" name="desconto_aplicado" value={form.desconto_aplicado} onChange={handleChange} step="0.01" className="w-full border rounded px-4 py-2" />
          </div>
          <div>
            <label className="font-semibold">Observações:</label>
            <textarea name="observacoes" value={form.observacoes} onChange={handleChange} className="w-full border rounded px-4 py-2" rows={3} />
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-100">Cancelar</button>
            <button type="submit" disabled={carregando} className={`px-4 py-2 rounded text-white font-bold ${carregando ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}>
              {carregando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
