import React, { useMemo, useState } from "react";
import { Calculator, CheckCircle2 } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import { contratarRenovarPlano, previewCoberturaPlano } from "../../services/planoService";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatarData(data) {
  if (!data) return "-";
  return new Date(`${String(data).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarRegra(regra) {
  return String(regra || "")
    .replaceAll("_", " ")
    .toLowerCase();
}

function getMensagemErro(error) {
  const code = error?.response?.data?.code;
  if (code === "COBERTURA_SOBREPOSTA") {
    return "O aluno ja possui cobertura paga vigente ou futura nesse periodo.";
  }
  if (code === "COBERTURA_CONTRATACAO_PAGAMENTO_INTEGRAL_OBRIGATORIO") {
    return "O pagamento precisa ser integral e igual ao valor calculado no preview.";
  }
  return getApiErrorMessage(error);
}

export default function ModalContratarRenovarPlano({ open, aluno, plano, onClose, onSuccess }) {
  const [form, setForm] = useState({
    data_inicio: hojeISO(),
    desconto_manual: "",
    forma_pagamento: "dinheiro",
    observacao: "",
  });
  const [preview, setPreview] = useState(null);
  const [erro, setErro] = useState(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const podeCalcular = Boolean(aluno?.id && aluno?.plano_id && form.data_inicio);
  const regrasAplicadas = useMemo(() => preview?.regras_aplicadas || [], [preview]);

  if (!open || !aluno) return null;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErro(null);

    if (name === "data_inicio" || name === "desconto_manual") {
      setPreview(null);
    }
  }

  function buildPayloadBase() {
    return {
      aluno_id: aluno.id,
      plano_id: aluno.plano_id,
      data_inicio: form.data_inicio,
      desconto_manual: form.desconto_manual === "" ? undefined : Number(form.desconto_manual || 0),
    };
  }

  async function calcularPreview(event) {
    event.preventDefault();
    if (!podeCalcular) {
      setErro("Aluno sem plano atual. Selecione um plano no cadastro antes de contratar/renovar.");
      return;
    }

    setCarregandoPreview(true);
    setErro(null);
    try {
      const resultado = await previewCoberturaPlano(buildPayloadBase());
      setPreview(resultado);
    } catch (error) {
      setPreview(null);
      setErro(getMensagemErro(error));
    } finally {
      setCarregandoPreview(false);
    }
  }

  async function confirmar() {
    if (!preview) {
      setErro("Calcule o preview antes de confirmar.");
      return;
    }

    setConfirmando(true);
    setErro(null);
    try {
      const resultado = await contratarRenovarPlano({
        ...buildPayloadBase(),
        valor_pago: preview.valor_cobrado,
        forma_pagamento: form.forma_pagamento,
        observacao: form.observacao,
      });
      await onSuccess?.(resultado);
      onClose?.();
    } catch (error) {
      setErro(getMensagemErro(error));
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Modal title={`Contratar/Renovar plano de ${aluno.nome}`} onClose={onClose} className="ui-modal--full">
      <form onSubmit={calcularPreview} className="space-y-4">
        <div className="ui-info-grid">
          <div className="ui-info-item">
            <div className="ui-info-item__label">Aluno</div>
            <div className="ui-info-item__value">{aluno.nome}</div>
          </div>
          <div className="ui-info-item">
            <div className="ui-info-item__label">Plano atual</div>
            <div className="ui-info-item__value">{plano?.nome || "Sem plano"}</div>
          </div>
        </div>

        <div className="ui-info-grid">
          <Input
            label="Data de inicio"
            type="date"
            name="data_inicio"
            value={form.data_inicio}
            onChange={handleChange}
            required
          />
          <Input
            label="Desconto manual"
            type="number"
            name="desconto_manual"
            value={form.desconto_manual}
            onChange={handleChange}
            min="0"
            step="0.01"
            placeholder="0,00"
          />
        </div>

        <div className="ui-info-grid">
          <label className="ui-field">
            <span className="ui-field__label">Forma de pagamento</span>
            <select
              name="forma_pagamento"
              value={form.forma_pagamento}
              onChange={handleChange}
              className="ui-input"
            >
              <option value="dinheiro">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartao de credito</option>
              <option value="cartao_debito">Cartao de debito</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </label>

          <label className="ui-field">
            <span className="ui-field__label">Observacao</span>
            <textarea
              name="observacao"
              value={form.observacao}
              onChange={handleChange}
              className="ui-input min-h-24"
              rows={3}
            />
          </label>
        </div>

        {erro && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {preview && (
          <div className="space-y-4 rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-slate-700">Preview de cobertura</div>
                <div className="text-xs text-slate-500">
                  {formatarData(preview.data_inicio)} ate {formatarData(preview.data_fim)}
                </div>
              </div>
              <Badge tone="blue">{preview.tipo_cobranca}</Badge>
            </div>

            <div className="ui-info-grid">
              <div className="ui-info-item">
                <div className="ui-info-item__label">Valor base</div>
                <div className="ui-info-item__value">{formatarMoeda(preview.valor_base)}</div>
              </div>
              <div className="ui-info-item">
                <div className="ui-info-item__label">Desconto percentual</div>
                <div className="ui-info-item__value">{Number(preview.desconto_percentual || 0)}%</div>
              </div>
              <div className="ui-info-item">
                <div className="ui-info-item__label">Desconto manual</div>
                <div className="ui-info-item__value">{formatarMoeda(preview.desconto_manual)}</div>
              </div>
              <div className="ui-info-item">
                <div className="ui-info-item__label">Desconto aplicado</div>
                <div className="ui-info-item__value">{formatarMoeda(preview.desconto_aplicado)}</div>
              </div>
              <div className="ui-info-item">
                <div className="ui-info-item__label">Valor a pagar</div>
                <div className="ui-info-item__value">{formatarMoeda(preview.valor_cobrado)}</div>
              </div>
              <div className="ui-info-item">
                <div className="ui-info-item__label">Valor pago</div>
                <div className="ui-info-item__value">{formatarMoeda(preview.valor_cobrado)}</div>
              </div>
            </div>

            {regrasAplicadas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {regrasAplicadas.slice(0, 5).map((regra) => (
                  <Badge key={regra} tone="gray">{formatarRegra(regra)}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={confirmando}>
            Cancelar
          </Button>
          <Button type="submit" variant="secondary" disabled={!podeCalcular || carregandoPreview || confirmando}>
            <Calculator size={15} /> {carregandoPreview ? "Calculando..." : "Calcular preview"}
          </Button>
          <Button type="button" onClick={confirmar} disabled={!preview || confirmando || carregandoPreview}>
            <CheckCircle2 size={15} /> {confirmando ? "Confirmando..." : "Confirmar contratacao"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
