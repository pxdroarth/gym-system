import React, { useEffect, useState } from "react";
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
  { value: ROLES.RECEPCAO, label: "Recepção" },
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

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSubmit?.(form);
  }

  return (
    <Modal title="Novo usuário interno" onClose={onClose} className="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <div className="ui-info-item__label">Governança</div>
          <div className="ui-info-item__value text-sm">
            Criação de usuário e promoção para administrador continuam validadas pelo backend.
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Criar usuário"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
