import React, { useEffect, useState } from "react";
import { Building2, ShieldCheck, UserCog, Users } from "lucide-react";
import { toast } from "react-toastify";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import RestrictedAreaNotice from "../../components/ui/RestrictedAreaNotice";
import Select from "../../components/ui/Select";
import useAuth from "../../hooks/useAuth";
import Table from "../../components/ui/Table";
import {
  alterarPapelUsuarioInterno,
  alterarStatusUsuarioInterno,
  criarUsuarioInterno,
  listarUsuariosInternos,
} from "../../services/usuariosInternosService";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { getRoleLabel, ROLES, UI_PERMISSIONS } from "../../utils/permissions";
import UsuarioInternoModal from "./UsuarioInternoModal";

const statusOptions = ["ativo", "inativo", "bloqueado"];

function statusBadge(status) {
  if (status === "ativo") return <Badge tone="green">Ativo</Badge>;
  if (status === "bloqueado") return <Badge tone="red">Bloqueado</Badge>;
  return <Badge tone="amber">Inativo</Badge>;
}

function roleBadge(role) {
  if (role === ROLES.PLATFORM_ADMIN) return <Badge tone="blue">Admin Plataforma</Badge>;
  if (role === ROLES.OWNER) return <Badge tone="blue">Owner</Badge>;
  if (role === ROLES.ADMIN) return <Badge tone="amber">Administrador</Badge>;
  if (role === ROLES.FINANCEIRO) return <Badge tone="green">Financeiro</Badge>;
  if (role === ROLES.GESTOR) return <Badge tone="gray">Gestor</Badge>;
  if (role === ROLES.RECEPCAO) return <Badge tone="gray">Recepcao</Badge>;
  return <Badge tone="gray">Operador de Acesso</Badge>;
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
      toast.error(getApiErrorMessage(error));
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
      toast.success("Usuario interno criado com sucesso.");
      setModalAberto(false);
      await carregarUsuarios();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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
      toast.error(getApiErrorMessage(error));
    }
  }

  async function handleAlterarStatus(usuario, status) {
    if (status === usuario.status) return;
    try {
      await alterarStatusUsuarioInterno(usuario.id, status);
      toast.success("Status atualizado.");
      await carregarUsuarios();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  const admins = usuarios.filter((usuario) => usuario.papel === ROLES.ADMIN || usuario.papel === ROLES.OWNER).length;
  const ativos = usuarios.filter((usuario) => usuario.status === "ativo").length;
  const platformAdmins = usuarios.filter((usuario) => usuario.papel === ROLES.PLATFORM_ADMIN).length;
  const canManagePlatformUsers = user?.papel === ROLES.PLATFORM_ADMIN;
  const papeis = [
    ...(canManagePlatformUsers ? [ROLES.PLATFORM_ADMIN] : []),
    ROLES.OWNER,
    ROLES.ADMIN,
    ROLES.GESTOR,
    ROLES.FINANCEIRO,
    ROLES.RECEPCAO,
    ROLES.OPERADOR_ACESSO,
  ];

  return (
    <RoleGate
      permission={UI_PERMISSIONS.USUARIOS_VISUALIZAR}
      fallback={
        <EmptyState
          title="Area restrita a administradores."
          description="Perfis operacionais nao recebem atalhos nem controles desta governanca interna."
        />
      }
    >
      <div className="governance-shell">
        <PageHeader
          title="Usuarios Internos"
          subtitle="Controle operacional de usuarios, papeis e status de acesso."
          actions={(
            <RoleGate permission={UI_PERMISSIONS.USUARIOS_CRIAR}>
              <Button onClick={() => setModalAberto(true)}>+ Novo Usuario</Button>
            </RoleGate>
          )}
        />

        <RestrictedAreaNotice
          title="Governanca interna"
          badgeLabel={canManagePlatformUsers ? "Plataforma" : "Administracao"}
          tone="blue"
          description="Esta tela continua submetida as permissoes reais do backend. Perfis operacionais nao recebem visibilidade de rotas, cards ou acoes sensiveis."
        />

        <Card className="governance-hero">
          <div className="governance-hero__content">
            <div>
              <div className="governance-hero__eyebrow">Administracao interna</div>
              <h2 className="governance-hero__title">
                Usuarios, papeis e status com leitura administrativa madura e isolamento claro por perfil.
              </h2>
              <p className="governance-hero__copy">
                A interface deixa explicito quem atua no escopo da plataforma e quem pertence a governanca da academia,
                sem criar permissoes falsas no frontend e sem abrir atalhos indevidos para perfis errados.
              </p>
            </div>

            <div className="governance-hero__meta">
              <div className="governance-hero__meta-card">
                <div className="governance-hero__meta-label">Seu papel</div>
                <div className="governance-hero__meta-value">{getRoleLabel(user?.papel)}</div>
                <div className="governance-hero__meta-copy">
                  Acoes visiveis seguem o papel autenticado e continuam validadas pelo backend.
                </div>
              </div>
              <div className="governance-hero__meta-card">
                <div className="governance-hero__meta-label">Isolamento</div>
                <div className="governance-hero__meta-value">{canManagePlatformUsers ? "Plataforma" : "Tenant"}</div>
                <div className="governance-hero__meta-copy">
                  Contas da plataforma ficam destacadas e sem edicao visual por perfis inadequados.
                </div>
              </div>
            </div>
          </div>
        </Card>

        <div className="ui-status-grid">
          <KpiCard label="Usuarios" value={usuarios.length} icon={<Users size={20} />} tone="blue" />
          <KpiCard label="Ativos" value={ativos} icon={<ShieldCheck size={20} />} tone="green" />
          <KpiCard label="Admins" value={admins} icon={<UserCog size={20} />} tone="amber" />
          <KpiCard label="Plataforma" value={platformAdmins} icon={<Building2 size={20} />} tone="blue" />
        </div>

        <Card className="governance-table-card">
          <div className="governance-panel__body">
            <div className="ui-section-header">
              <div>
                <h2 className="ui-section-title">Equipe Interna</h2>
                <p className="ui-section-subtitle">Alteracoes sensiveis sao auditadas e validadas pelo backend.</p>
              </div>
              <Badge tone="gray">{canManagePlatformUsers ? "Escopo plataforma" : "Escopo administrativo"}</Badge>
            </div>

            {loading ? (
              <EmptyState title="Carregando usuarios..." />
            ) : usuarios.length === 0 ? (
              <EmptyState title="Nenhum usuario interno cadastrado." />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Login</th>
                    <th>Email</th>
                    <th>Papel</th>
                    <th>Status</th>
                    <th>Ultimo acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.map((usuario) => {
                    const isPlatformRow = usuario.papel === ROLES.PLATFORM_ADMIN;
                    const platformRowLocked = isPlatformRow && !canManagePlatformUsers;

                    return (
                      <tr key={usuario.id}>
                        <td className="font-semibold">{usuario.nome}</td>
                        <td>{usuario.login || "-"}</td>
                        <td>{usuario.email || "-"}</td>
                        <td>
                          {platformRowLocked ? (
                            <div className="space-y-2">
                              <div>{roleBadge(usuario.papel)}</div>
                              <div className="text-xs text-slate-500">Gerido pela plataforma.</div>
                            </div>
                          ) : (
                            <RoleGate permission={UI_PERMISSIONS.USUARIOS_ALTERAR_PAPEL}>
                              <div className="space-y-2">
                                <div className="governance-role-badge">{roleBadge(usuario.papel)}</div>
                                <Select
                                  value={usuario.papel}
                                  onChange={(event) => handleAlterarPapel(usuario, event.target.value)}
                                >
                                  {papeis.map((papel) => (
                                    <option key={papel} value={papel}>{getRoleLabel(papel)}</option>
                                  ))}
                                </Select>
                              </div>
                            </RoleGate>
                          )}
                        </td>
                        <td>
                          {platformRowLocked ? (
                            <div className="space-y-2">
                              <div>{statusBadge(usuario.status)}</div>
                              <div className="text-xs text-slate-500">Sem controle visual neste perfil.</div>
                            </div>
                          ) : (
                            <RoleGate permission={UI_PERMISSIONS.USUARIOS_ALTERAR_STATUS}>
                              <div className="flex items-center gap-2">
                                {statusBadge(usuario.status)}
                                <Select
                                  value={usuario.status}
                                  onChange={(event) => handleAlterarStatus(usuario, event.target.value)}
                                >
                                  {statusOptions.map((status) => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </Select>
                              </div>
                            </RoleGate>
                          )}
                        </td>
                        <td>{usuario.ultimo_acesso_em || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </div>
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
