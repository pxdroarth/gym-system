import React, { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import { getRoleLabel } from "../../utils/permissions";
import UnidadesChecklist from "./UnidadesChecklist";

const STATUS_LABEL = { ativo: "Ativo", inativo: "Inativo", bloqueado: "Bloqueado" };

function ReadOnly({ children, motivo }) {
  return (
    <div className="ops-dialog__readonly">
      <span>{children}</span>
      {motivo && (
        <span className="ops-lock">
          <Lock size={13} aria-hidden="true" />
          {motivo}
        </span>
      )}
    </div>
  );
}

// Edicao sob demanda de papel, status e unidades de um usuario.
// Cada mudanca segue pelo mesmo endpoint da GS-03 (PATCH papel/status/unidades);
// a API continua decidindo o que este operador pode alterar.
export default function GerenciarAcessoModal({
  usuario,
  opcoes,
  podeEditarPapel,
  podeEditarStatus,
  podeEditarUnidades,
  motivoPapelStatus,
  motivoUnidades,
  onClose,
  onSubmit,
  loading,
}) {
  const [papel, setPapel] = useState("");
  const [status, setStatus] = useState("");
  const [unitIds, setUnitIds] = useState([]);
  const [padraoId, setPadraoId] = useState(null);

  useEffect(() => {
    if (!usuario) return;
    const atuais = (usuario.unidades || []).map((u) => Number(u.id));
    const padrao = (usuario.unidades || []).find((u) => Number(u.is_default) === 1);
    setPapel(usuario.papel);
    setStatus(usuario.status);
    setUnitIds(atuais);
    setPadraoId(padrao ? Number(padrao.id) : atuais[0] || null);
  }, [usuario]);

  const papeisAtribuiveis = opcoes?.papeis_atribuiveis || [];
  const opcoesPapel = usuario && !papeisAtribuiveis.includes(usuario.papel)
    ? [usuario.papel, ...papeisAtribuiveis]
    : papeisAtribuiveis;
  const statusOptions = opcoes?.status || ["ativo", "inativo", "bloqueado"];
  const legados = (usuario?.unidades || []).filter((u) => !u.origem);

  const alteracoes = useMemo(() => {
    if (!usuario) return {};
    const atuais = (usuario.unidades || []).map((u) => Number(u.id)).sort((a, b) => a - b);
    const padraoAtual = (usuario.unidades || []).find((u) => Number(u.is_default) === 1);
    const novas = [...unitIds].sort((a, b) => a - b);
    const unidadesMudaram = JSON.stringify(atuais) !== JSON.stringify(novas)
      || (padraoAtual ? Number(padraoAtual.id) : null) !== padraoId;
    return {
      papel: podeEditarPapel && papel !== usuario.papel ? papel : undefined,
      status: podeEditarStatus && status !== usuario.status ? status : undefined,
      // Salvar com vinculo legado mantido registra a confirmacao (GS-03).
      unidades: podeEditarUnidades && (unidadesMudaram || legados.length > 0)
        ? { unitIds, unitPadraoId: padraoId }
        : undefined,
    };
  }, [usuario, papel, status, unitIds, padraoId, podeEditarPapel, podeEditarStatus, podeEditarUnidades, legados.length]);

  if (!usuario) return null;

  const temAlteracao = Boolean(alteracoes.papel || alteracoes.status || alteracoes.unidades);
  const identificacao = [usuario.login, usuario.email].filter(Boolean).join(" · ");
  const unidadesTexto = (usuario.unidades || []).map((u) => u.nome).join(", ") || "Nenhuma";

  return (
    <Modal title="Gerenciar acesso" onClose={onClose} className="max-w-2xl">
      <div className="ops-dialog">
        <div className="ops-dialog__who">
          <div className="ops-user__name">{usuario.nome}</div>
          {identificacao && <div className="ops-user__id">{identificacao}</div>}
        </div>

        <div className="ops-dialog__section">
          {podeEditarPapel ? (
            <Select label="Papel" value={papel} onChange={(event) => setPapel(event.target.value)} disabled={loading}>
              {opcoesPapel.map((item) => (
                <option key={item} value={item} disabled={!papeisAtribuiveis.includes(item)}>
                  {getRoleLabel(item)}
                </option>
              ))}
            </Select>
          ) : (
            <>
              <span className="ops-dialog__label">Papel</span>
              <ReadOnly motivo={motivoPapelStatus}>{getRoleLabel(usuario.papel)}</ReadOnly>
            </>
          )}
        </div>

        <div className="ops-dialog__section">
          {podeEditarStatus ? (
            <Select label="Status" value={status} onChange={(event) => setStatus(event.target.value)} disabled={loading}>
              {statusOptions.map((item) => (
                <option key={item} value={item}>{STATUS_LABEL[item] || item}</option>
              ))}
            </Select>
          ) : (
            <>
              <span className="ops-dialog__label">Status</span>
              <ReadOnly motivo={motivoPapelStatus}>{STATUS_LABEL[usuario.status] || usuario.status}</ReadOnly>
            </>
          )}
        </div>

        <div className="ops-dialog__section">
          <span className="ops-dialog__label">
            Unidades autorizadas{opcoes?.tenant?.nome ? ` · ${opcoes.tenant.nome}` : ""}
          </span>
          {podeEditarUnidades ? (
            <>
              {legados.length > 0 && (
                <div className="ops-dialog__warning">
                  <strong>Vínculos de origem não confirmada:</strong> {legados.map((u) => u.nome).join(", ")}.
                  Criados antes da GS-03. Mantenha marcado apenas se o acesso for devido; ao salvar, o que permanecer
                  fica registrado como confirmado.
                </div>
              )}
              <UnidadesChecklist
                unidades={opcoes?.unidades || []}
                selecionadas={unitIds}
                padraoId={padraoId}
                onChange={(next) => { setUnitIds(next.unitIds); setPadraoId(next.padraoId); }}
                disabled={loading}
              />
              {unitIds.length === 0 && (
                <div className="ops-dialog__note">
                  Sem unidades nesta Rede, o usuário só continua com acesso se tiver unidade em outra Rede; caso contrário o
                  sistema recusa.
                </div>
              )}
            </>
          ) : (
            <ReadOnly motivo={motivoUnidades}>{unidadesTexto}</ReadOnly>
          )}
        </div>

        <p className="ops-dialog__note">
          Mudanças de papel, status ou unidades encerram as sessões abertas do usuário e ficam registradas no histórico.
        </p>

        <div className="ops-dialog__footer">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button type="button" onClick={() => onSubmit?.(alteracoes)} disabled={loading || !temAlteracao}>
            {loading ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
