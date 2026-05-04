import React, { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, UserCog } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import useAuth from "../../hooks/useAuth";
import { ROLES } from "../../utils/permissions";

const papeis = [
  { value: ROLES.PLATFORM_ADMIN, label: "Admin Plataforma" },
  { value: ROLES.OWNER, label: "Owner" },
  { value: ROLES.ADMIN, label: "Administrador" },
  { value: ROLES.RECEPCAO, label: "Recepcao" },
  { value: ROLES.GESTOR, label: "Gestor" },
  { value: ROLES.FINANCEIRO, label: "Financeiro" },
  { value: ROLES.OPERADOR_ACESSO, label: "Operador de Acesso" },
];

const statusOptions = [
  { value: "ativo", label: "Ativo" },
  { value: "inativo", label: "Inativo" },
  { value: "bloqueado", label: "Bloqueado" },
];

function formInicial() {
  return {
    nome: "",
    email: "",
    login: "",
    senha: "",
    papel: ROLES.RECEPCAO,
    status: "ativo",
  };
}

export default function UsuarioInternoModal({ open, onClose, onSubmit, loading }) {
  const { user } = useAuth();
  const [form, setForm] = useState(formInicial());
  const papeisDisponiveis = papeis.filter((papel) => (
    papel.value !== ROLES.PLATFORM_ADMIN || user?.papel === ROLES.PLATFORM_ADMIN
  ));

  useEffect(() => {
    if (open) setForm(formInicial());
  }, [open]);

  if (!open) return null;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit?.(form);
  }

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
                  <option key={papel.value} value={papel.value}>{papel.label}</option>
                ))}
              </Select>
              <Select label="Status" name="status" value={form.status} onChange={handleChange}>
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </Select>
            </div>

            <div className="ui-info-item">
              <div className="ui-info-item__label">Governanca</div>
              <div className="ui-info-item__value text-sm">
                Criacao de usuario e promocao para administrador continuam validadas pelo backend.
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
                  <div className="governance-list__copy">platform_admin so aparece para quem ja pertence a administracao da plataforma.</div>
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
                  <div className="governance-list__title">Escopo visual</div>
                  <div className="governance-list__copy">A interface reflete o papel retornado pelo backend sem duplicar a logica de seguranca.</div>
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
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Criar usuario"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
