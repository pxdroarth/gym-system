import React, { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, UserCog } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import useAuth from "../../hooks/useAuth";
import { getRoleLabel, ROLES } from "../../utils/permissions";
import UnidadesChecklist from "./UnidadesChecklist";

const statusOptions = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "bloqueado", label: "Bloqueado" },
];

function formInicial(opcoes) {
  const unidades = opcoes?.unidades || [];
  const papeis = opcoes?.papeis_atribuiveis || [];
  const primeira = unidades.length === 1 ? Number(unidades[0].id) : null;
  return {
    nome: "",
    email: "",
    login: "",
    senha: "",
    papel: papeis.includes(ROLES.RECEPCAO) ? ROLES.RECEPCAO : (papeis[papeis.length - 1] || ROLES.RECEPCAO),
    status: "ativo",
    unitIds: primeira ? [primeira] : [],
    padraoId: primeira,
  };
}

// Papeis e unidades vem de GET /usuarios-internos/opcoes: o backend decide o
// que este operador pode atribuir e valida de novo ao salvar.
export default function UsuarioInternoModal({ open, onClose, onSubmit, loading, opcoes }) {
  const { user } = useAuth();
  const [form, setForm] = useState(formInicial(opcoes));
  const papeisDisponiveis = opcoes?.papeis_atribuiveis || [];

  useEffect(() => {
    if (open) setForm(formInicial(opcoes));
  }, [open, opcoes]);

  if (!open) return null;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const { unitIds, padraoId, ...dados } = form;
    onSubmit?.({
      ...dados,
      unit_ids: unitIds,
      unit_padrao_id: padraoId,
      ...(opcoes?.pode_escolher_rede && opcoes?.tenant?.id ? { tenant_id: opcoes.tenant.id } : {}),
    });
  }

  const semUnidade = form.unitIds.length === 0;

  return (
    <Modal title="Novo usuario interno" onClose={onClose} className="max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="governance-modal-grid">
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Nome" name="nome" value={form.nome} onChange={handleChange} required />
              <Input label="Login" name="login" value={form.login} onChange={handleChange} required />
              <Input label="Email" name="email" type="email" value={form.email} onChange={handleChange} />
              <Input label="Senha inicial" name="senha" type="password" value={form.senha} onChange={handleChange} required />
              <Select label="Papel" name="papel" value={form.papel} onChange={handleChange}>
                {papeisDisponiveis.map((papel) => (
                  <option key={papel} value={papel}>{getRoleLabel(papel)}</option>
                ))}
              </Select>
              <Select label="Status" name="status" value={form.status} onChange={handleChange}>
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <div className="ui-field__label">
                Unidades autorizadas{opcoes?.tenant?.nome ? ` - ${opcoes.tenant.nome}` : ""}
              </div>
              <UnidadesChecklist
                unidades={opcoes?.unidades || []}
                selecionadas={form.unitIds}
                padraoId={form.padraoId}
                onChange={({ unitIds, padraoId }) => setForm((prev) => ({ ...prev, unitIds, padraoId }))}
                disabled={loading}
              />
              {semUnidade && <div className="text-xs text-red-600">Selecione ao menos uma unidade.</div>}
            </div>

            <div className="ui-info-item">
              <div className="ui-info-item__label">Governanca</div>
              <div className="ui-info-item__value text-sm">
                Papel, status e unidades sao validados pelo backend: so aparecem papeis e unidades que o seu perfil pode atribuir.
              </div>
            </div>
          </div>

          <div className="governance-modal-panel">
            <h3 className="governance-modal-panel__title">Contexto da criacao</h3>
            <p className="governance-modal-panel__copy">
              Esta tela cria usuarios internos sem abrir permissoes paralelas. O backend continua como autoridade para papeis e restricoes sensiveis.
            </p>

            <div className="governance-list mt-4">
              <div className="governance-list__item">
                <div>
                  <div className="governance-list__title">Papel disponivel</div>
                  <div className="governance-list__copy">platform_admin so aparece para a plataforma; ninguem atribui papel acima do proprio.</div>
                </div>
                <div className="governance-list__value"><ShieldCheck size={18} /></div>
              </div>
              <div className="governance-list__item">
                <div>
                  <div className="governance-list__title">Credencial inicial</div>
                  <div className="governance-list__copy">A senha inicial e apenas ponto de entrada e continua protegida pelo fluxo real de autenticacao.</div>
                </div>
                <div className="governance-list__value"><KeyRound size={18} /></div>
              </div>
              <div className="governance-list__item">
                <div>
                  <div className="governance-list__title">Sem vinculo automatico</div>
                  <div className="governance-list__copy">O usuario so acessa as unidades marcadas aqui. Nao ha acesso implicito a Matriz.</div>
                </div>
                <div className="governance-list__value"><UserCog size={18} /></div>
              </div>
            </div>

            <div className="mt-4">
              <Badge tone="blue">
                {user?.papel === ROLES.PLATFORM_ADMIN ? "Criando como plataforma" : "Criando no escopo administrativo"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading || semUnidade}>
            {loading ? "Salvando..." : "Criar usuario"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
