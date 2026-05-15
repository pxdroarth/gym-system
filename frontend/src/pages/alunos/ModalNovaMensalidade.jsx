import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import { cadastrarMensalidade } from '../../services/Api';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { getApiErrorMessage } from '../../utils/getApiErrorMessage';

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
      toast.error(getApiErrorMessage(err));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Modal title={`Registrar Mensalidade de ${aluno.nome}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Vencimento"
          type="date"
          name="vencimento"
          value={form.vencimento}
          onChange={handleChange}
          required
        />
        <Input
          label="Valor (opcional)"
          type="number"
          name="valor_cobrado"
          value={form.valor_cobrado}
          onChange={handleChange}
          step="0.01"
          placeholder="Usa o valor base do plano quando vazio"
        />
        <Input
          label="Desconto"
          type="number"
          name="desconto_aplicado"
          value={form.desconto_aplicado}
          onChange={handleChange}
          step="0.01"
        />
        <label className="ui-field">
          <span className="ui-field__label">Observações</span>
          <textarea
            name="observacoes"
            value={form.observacoes}
            onChange={handleChange}
            className="ui-input min-h-24"
            rows={3}
          />
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={carregando}>
            {carregando ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
