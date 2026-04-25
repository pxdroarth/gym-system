import React, { useEffect, useState } from "react";
import { ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "react-toastify";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import Select from "../../components/ui/Select";
import useAuth from "../../hooks/useAuth";
import Table from "../../components/ui/Table";
import {
  alterarPapelUsuarioInterno,
  alterarStatusUsuarioInterno,
  criarUsuarioInterno,
  listarUsuariosInternos,
} from "../../services/usuariosInternosService";
import { getRoleLabel, ROLES, UI_PERMISSIONS } from "../../utils/permissions";
import UsuarioInternoModal from "./UsuarioInternoModal";

const statusOptions = ["ativo", "inativo", "bloqueado"];

function statusBadge(status) {
  if (status === "ativo") return <Badge tone="green">Ativo</Badge>;
  if (status === "bloqueado") return <Badge tone="red">Bloqueado</Badge>;
  return <Badge tone="amber">Inativo</Badge>;
}

export default function UsuariosInternosPage() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);

  async function carregarUsuarios() {
    setLoading(true);
    try {
      const resposta = await listarUsuariosInternos();
      setUsuarios(resposta.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao carregar usuários internos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarUsuarios();
  }, []);

  async function handleCriarUsuario(payload) {
    try {
      setSalvando(true);
      await criarUsuarioInterno(payload);
      toast.success("Usuário interno criado com sucesso.");
      setModalAberto(false);
      await carregarUsuarios();
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao criar usuário.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleAlterarPapel(usuario, papel) {
    if (papel === usuario.papel) return;
    try {
      await alterarPapelUsuarioInterno(usuario.id, papel);
      toast.success("Papel atualizado.");
      await carregarUsuarios();
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao alterar papel.");
    }
  }

  async function handleAlterarStatus(usuario, status) {
    if (status === usuario.status) return;
    try {
      await alterarStatusUsuarioInterno(usuario.id, status);
      toast.success("Status atualizado.");
      await carregarUsuarios();
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao alterar status.");
    }
  }

  const admins = usuarios.filter((usuario) => usuario.papel === ROLES.ADMIN || usuario.papel === ROLES.OWNER).length;
  const ativos = usuarios.filter((usuario) => usuario.status === "ativo").length;
  const papeis = [
    ...(user?.papel === ROLES.PLATFORM_ADMIN ? [ROLES.PLATFORM_ADMIN] : []),
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.GESTOR,
    ROLES.FINANCEIRO,
    ROLES.RECEPCAO,
    ROLES.OPERADOR_ACESSO,
  ];

  return (
    <RoleGate
      permission={UI_PERMISSIONS.USUARIOS_INTERNOS_GERENCIAR}
      fallback={<EmptyState title="Área restrita a administradores." />}
    >
      <div className="space-y-6">
        <PageHeader
          title="Usuários Internos"
          subtitle="Controle operacional de usuários, papéis e status de acesso."
          actions={<Button onClick={() => setModalAberto(true)}>+ Novo Usuário</Button>}
        />

        <div className="ui-status-grid">
          <KpiCard label="Usuários" value={usuarios.length} icon={<Users size={20} />} tone="blue" />
          <KpiCard label="Ativos" value={ativos} icon={<ShieldCheck size={20} />} tone="green" />
          <KpiCard label="Admins" value={admins} icon={<UserCog size={20} />} tone="amber" />
        </div>

        <Card>
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Equipe Interna</h2>
              <p className="ui-section-subtitle">Alterações sensíveis são auditadas e validadas pelo backend.</p>
            </div>
          </div>

          {loading ? (
            <EmptyState title="Carregando usuários..." />
          ) : usuarios.length === 0 ? (
            <EmptyState title="Nenhum usuário interno cadastrado." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Login</th>
                  <th>Email</th>
                  <th>Papel</th>
                  <th>Status</th>
                  <th>Último acesso</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr key={usuario.id}>
                    <td className="font-semibold">{usuario.nome}</td>
                    <td>{usuario.login || "-"}</td>
                    <td>{usuario.email || "-"}</td>
                    <td>
                      <RoleGate permission={UI_PERMISSIONS.USUARIOS_INTERNOS_GERENCIAR}>
                        <Select
                          value={usuario.papel}
                          onChange={(e) => handleAlterarPapel(usuario, e.target.value)}
                        >
                          {papeis.map((papel) => (
                            <option key={papel} value={papel}>{getRoleLabel(papel)}</option>
                          ))}
                        </Select>
                      </RoleGate>
                    </td>
                    <td>
                      <RoleGate permission={UI_PERMISSIONS.USUARIOS_INTERNOS_GERENCIAR}>
                        <div className="flex items-center gap-2">
                          {statusBadge(usuario.status)}
                          <Select
                            value={usuario.status}
                            onChange={(e) => handleAlterarStatus(usuario, e.target.value)}
                          >
                            {statusOptions.map((status) => (
                              <option key={status} value={status}>{status}</option>
                            ))}
                          </Select>
                        </div>
                      </RoleGate>
                    </td>
                    <td>{usuario.ultimo_acesso_em || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <UsuarioInternoModal
          open={modalAberto}
          onClose={() => setModalAberto(false)}
          onSubmit={handleCriarUsuario}
          loading={salvando}
        />
      </div>
    </RoleGate>
  );
}
