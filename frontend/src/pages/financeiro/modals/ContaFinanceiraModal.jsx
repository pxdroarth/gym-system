import React, { useEffect, useMemo, useState } from "react";
import { atualizarContaFinanceira, criarContaFinanceira } from "../../../services/contasFinanceiras";
import { getPlanoContas } from "../../../services/planoContasService";
import Button from "../../../components/ui/Button";
import Input from "../../../components/ui/Input";
import Modal from "../../../components/ui/Modal";
import Select from "../../../components/ui/Select";
import getApiErrorMessage from "../../../utils/getApiErrorMessage";

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
      getPlanoContas().then(setPlanos).catch((error) => setErro(getApiErrorMessage(error)));
    }
  }, [aberto, conta]);

  const valorNumerico = useMemo(() => Number(form.valor || 0), [form.valor]);

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
    } catch (error) {
      setErro(getApiErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;

  return (
    <Modal title={conta ? "Editar Conta Financeira" : "Nova Conta Financeira"} onClose={onClose} className="max-w-4xl">
      {erro && <div className="text-red-700 font-semibold mb-3">{erro}</div>}

      <div className="finance-modal-grid">
        <div className="finance-modal-panel">
          <h3 className="finance-modal-panel__title">Dados do lançamento</h3>
          <p className="finance-modal-panel__copy">O fluxo de criação e edição continua exatamente igual, com o mesmo payload e os mesmos serviços.</p>

          <div className="grid grid-cols-1 gap-3 mt-4">
            <Input
              label="Descrição"
              placeholder="Descrição"
              value={form.descricao}
              onChange={(event) => setForm({ ...form, descricao: event.target.value })}
            />
            <Select label="Tipo" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </Select>
            <Input
              label="Valor"
              type="number"
              placeholder="Valor"
              value={form.valor}
              onChange={(event) => setForm({ ...form, valor: event.target.value })}
            />
            <Input
              label="Data de Lançamento"
              type="date"
              value={form.data_lancamento}
              onChange={(event) => setForm({ ...form, data_lancamento: event.target.value })}
            />
            <Select label="Status" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
            </Select>
            <Select
              label="Plano de Contas"
              value={form.plano_contas_id}
              onChange={(event) => setForm({ ...form, plano_contas_id: event.target.value })}
            >
              <option value="">Selecione o Plano de Contas</option>
              {planos.map((plano) => (
                <option key={plano.id} value={plano.id}>{plano.nome}</option>
              ))}
            </Select>
            <Input
              label="Observação"
              placeholder="Observação opcional"
              value={form.observacao}
              onChange={(event) => setForm({ ...form, observacao: event.target.value })}
            />
          </div>
        </div>

        <div className="finance-modal-panel">
          <h3 className="finance-modal-panel__title">Resumo crítico</h3>
          <p className="finance-modal-panel__copy">Leitura rápida para reforçar o peso operacional do lançamento sem alterar a regra do módulo.</p>

          <div className="finance-list mt-4">
            <div className="finance-list__item">
              <div>
                <div className="finance-list__title">Tipo</div>
                <div className="finance-list__copy">Receita ou despesa conforme classificação atual.</div>
              </div>
              <div className="finance-list__value">{form.tipo}</div>
            </div>
            <div className="finance-list__item">
              <div>
                <div className="finance-list__title">Valor informado</div>
                <div className="finance-list__copy">Valor numérico enviado ao endpoint atual.</div>
              </div>
              <div className="finance-list__value">
                {valorNumerico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
            <div className="finance-list__item">
              <div>
                <div className="finance-list__title">Status</div>
                <div className="finance-list__copy">Mantido como pendente ou pago, sem nova semântica paralela.</div>
              </div>
              <div className="finance-list__value">{form.status}</div>
            </div>
          </div>
        </div>
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
