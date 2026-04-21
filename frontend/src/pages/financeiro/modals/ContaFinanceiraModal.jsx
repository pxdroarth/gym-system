import React, { useEffect, useState } from "react";
import { atualizarContaFinanceira, criarContaFinanceira } from '../../../services/contasFinanceiras';
import { getPlanoContas } from '../../../services/planoContasService';
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";

export default function ContaFinanceiraModal({ aberto, conta, onClose, onSalvo }) {
  const [form, setForm] = useState({
    descricao: "",
    tipo: "despesa",
    valor: "",
    data_lancamento: "",
    status: "pendente",
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
        descricao: conta?.descricao || "",
        tipo: conta?.tipo || "despesa",
        valor: conta?.valor || "",
        data_lancamento: conta?.data_lancamento ? String(conta.data_lancamento).slice(0, 10) : "",
        status: conta?.status || "pendente",
        plano_contas_id: conta?.plano_contas_id || "",
        observacao: conta?.observacao || "",
      });
      getPlanoContas().then(setPlanos);
    }
  }, [aberto, conta]);

  async function salvar() {
    setErro(null);
    if (!form.descricao || !form.tipo || !form.valor || !form.data_lancamento || !form.status || !form.plano_contas_id) {
      setErro("Preencha todos os campos obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        ...form,
        valor: Number(form.valor),
        plano_contas_id: Number(form.plano_contas_id),
      };

      if (conta?.id) {
        await atualizarContaFinanceira(conta.id, payload);
      } else {
        await criarContaFinanceira(payload);
      }

      if (onSalvo) onSalvo();
      onClose();
    } catch (e) {
      setErro("Erro ao salvar conta financeira");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  return (
    <Modal title={conta ? "Editar Conta Financeira" : "Nova Conta Financeira"} onClose={onClose}>
      {erro && <div className="text-red-700 font-semibold mb-3">{erro}</div>}

      <div className="grid grid-cols-1 gap-3">
        <Input
          label="Descrição"
          placeholder="Descrição"
          value={form.descricao}
          onChange={e => setForm({ ...form, descricao: e.target.value })}
        />
        <Select label="Tipo" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </Select>
        <Input
          label="Valor"
          type="number"
          placeholder="Valor"
          value={form.valor}
          onChange={e => setForm({ ...form, valor: e.target.value })}
        />
        <Input
          label="Data de Lançamento"
          type="date"
          value={form.data_lancamento}
          onChange={e => setForm({ ...form, data_lancamento: e.target.value })}
        />
        <Select label="Status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option value="pendente">Pendente</option>
          <option value="pago">Pago</option>
        </Select>
        <Select
          label="Plano de Contas"
          value={form.plano_contas_id}
          onChange={e => setForm({ ...form, plano_contas_id: e.target.value })}
        >
          <option value="">Selecione o Plano de Contas</option>
          {planos.map(p => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </Select>
        <Input
          label="Observação"
          placeholder="Observação opcional"
          value={form.observacao}
          onChange={e => setForm({ ...form, observacao: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button type="button" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </Modal>
  );
}
