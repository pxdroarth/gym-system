import React, { useEffect, useState } from "react";
import { ChevronRight, Lock, Plus, ShieldAlert } from "lucide-react";
import { toast } from "react-toastify";
import RoleGate from "../../components/auth/RoleGate";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Select from "../../components/ui/Select";
import useAuth from "../../hooks/useAuth";
import useMediaQuery from "../../hooks/useMediaQuery";
import Table from "../../components/ui/Table";
import {
  alterarPapelUsuarioInterno,
  alterarStatusUsuarioInterno,
  alterarUnidadesUsuarioInterno,
  criarUsuarioInterno,
  desativarVinculoUnidade,
  listarUsuariosInternos,
} from "../../services/usuariosInternosService";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { getRoleLabel, ROLES, UI_PERMISSIONS, userHasUiPermission } from "../../utils/permissions";
import UsuarioInternoModal from "./UsuarioInternoModal";
import GerenciarAcessoModal from "./GerenciarAcessoModal";

// Motivos devolvidos pelo backend (GS-03). A tela so explica; quem decide e a API.
const MOTIVOS_BLOQUEIO = {
  USUARIO_AUTOGESTAO_BLOQUEADA: "Sua própria conta não é editada aqui.",
  PLATFORM_ADMIN_RESTRITO: "Gerido pela plataforma.",
  HIERARQUIA_INSUFICIENTE: "Papel acima do seu.",
  USUARIO_FORA_DAS_UNIDADES_GERENCIAVEIS: "Possui unidades que você não gerencia.",
  USUARIO_MULTI_REDE_RESTRITO: "Vinculado a outra Rede: papel e status só pela plataforma.",
};

const STATUS_LABEL = { ativo: "Ativo", inativo: "Inativo", bloqueado: "Bloqueado" };
// Cor so para quem exige atencao; sempre acompanhada do texto.
const STATUS_CLASS = { ativo: "ops-status--success", inativo: "ops-status--warning", bloqueado: "ops-status--danger" };

function listarNomes(itens) {
  if (!itens.length) return "Nenhum";
  return itens.join(", ");
}

function ordenarUnidades(unidades = []) {
  return [...unidades].sort((a, b) => Number(b.is_default) - Number(a.is_default));
}

function Unidades({ unidades, papel }) {
  const lista = ordenarUnidades(unidades);
  if (!lista.length) return <span className="ops-muted">Nenhuma</span>;
  const principal = lista[0];
  const restantes = lista.length - 1;
  const nome = (unidade) => `${unidade.nome}${!unidade.origem ? " *" : ""}`;

  return (
    <>
      <span className="ops-units ops-units__full">
        {lista.map((unidade, index) => (
          <React.Fragment key={unidade.id}>
            {index > 0 && ", "}
            {Number(unidade.is_default) === 1 ? (
              <span className="ops-units__default">
                {nome(unidade)}
                <span className="ops-units__tag">padrão</span>
              </span>
            ) : (
              nome(unidade)
            )}
          </React.Fragment>
        ))}
      </span>
      <span className="ops-units__main">
        {getRoleLabel(papel)} · {nome(principal)}{restantes > 0 ? ` +${restantes}` : ""}
      </span>
    </>
  );
}

export default function UsuariosInternosPage() {
  const { user } = useAuth();
  const celular = useMediaQuery("(max-width: 767px)");
  const [usuarios, setUsuarios] = useState([]);
  const [contexto, setContexto] = useState(null);
  const [redeFiltro, setRedeFiltro] = useState("");
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [usuarioAcesso, setUsuarioAcesso] = useState(null);
  const [escopoAberto, setEscopoAberto] = useState(!celular);
  // Sem permissao de leitura a API responde 403: nao chamar evita avisos de erro na tela restrita.
  const podeVisualizar = userHasUiPermission(user, UI_PERMISSIONS.USUARIOS_VISUALIZAR);

  useEffect(() => {
    setEscopoAberto(!celular);
  }, [celular]);

  async function carregarUsuarios(tenantId = redeFiltro) {
    setLoading(true);
    try {
      const resposta = await listarUsuariosInternos(tenantId || undefined);
      const lista = resposta.data || [];
      setUsuarios(lista);
      setContexto(resposta.contexto || null);
      return lista;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!podeVisualizar) return;
    carregarUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redeFiltro, podeVisualizar]);

  async function handleCriarUsuario(payload) {
    try {
      setSalvando(true);
      await criarUsuarioInterno(payload);
      toast.success("Usuário criado com sucesso.");
      setModalAberto(false);
      await carregarUsuarios();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }

  // Aplica cada mudanca pelo endpoint proprio da GS-03, na ordem papel -> status -> unidades.
  async function handleSalvarAcesso(alteracoes) {
    if (!usuarioAcesso) return;
    const alvo = usuarioAcesso;
    const tenantId = redeFiltro || undefined;
    setSalvando(true);
    try {
      if (alteracoes.papel) await alterarPapelUsuarioInterno(alvo.id, alteracoes.papel, tenantId);
      if (alteracoes.status) await alterarStatusUsuarioInterno(alvo.id, alteracoes.status, tenantId);
      if (alteracoes.unidades) {
        await alterarUnidadesUsuarioInterno(alvo.id, {
          ...alteracoes.unidades,
          tenantId: contexto?.pode_escolher_rede ? contexto?.tenant?.id : undefined,
        });
      }
      toast.success("Acesso atualizado. As sessões do usuário foram encerradas.");
      setUsuarioAcesso(null);
      await carregarUsuarios();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      // Parte das mudancas pode ter sido aplicada: recarrega e mantem a janela com o estado real.
      const lista = await carregarUsuarios();
      const atualizado = lista?.find((item) => item.id === alvo.id);
      setUsuarioAcesso(atualizado || null);
    } finally {
      setSalvando(false);
    }
  }

  async function handleDesativarVinculo(usuario) {
    if (!window.confirm(`Desativar o acesso de ${usuario.nome} à unidade selecionada?`)) return;
    setSalvando(true);
    try {
      await desativarVinculoUnidade(usuario.id);
      toast.success("Vínculo desativado.");
      await carregarUsuarios();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }

  const ativos = usuarios.filter((usuario) => usuario.status === "ativo").length;
  const canManagePlatformUsers = user?.papel === ROLES.PLATFORM_ADMIN;
  const papeisAtribuiveis = contexto?.papeis_atribuiveis || [];
  // Plataforma vendo "todas as Redes" nao tem Rede de contexto para editar unidades.
  const unidadesEditaveisNaVisao = !canManagePlatformUsers || Boolean(redeFiltro);
  const temVinculoLegado = usuarios.some((usuario) => (usuario.unidades || []).some((unidade) => !unidade.origem));
  const podeAlterarPapel = userHasUiPermission(user, UI_PERMISSIONS.USUARIOS_ALTERAR_PAPEL);
  const podeAlterarStatus = userHasUiPermission(user, UI_PERMISSIONS.USUARIOS_ALTERAR_STATUS);
  const podeAlterarUnidades = userHasUiPermission(user, UI_PERMISSIONS.USUARIOS_ALTERAR_UNIDADES);
  const nomeRede = canManagePlatformUsers && !redeFiltro ? "Todas as Redes" : contexto?.tenant?.nome;

  function permissoesDaLinha(usuario) {
    const papelStatus = Boolean(usuario.papel_status_editavel);
    const unidades = Boolean(usuario.gerenciavel) && unidadesEditaveisNaVisao && podeAlterarUnidades;
    let motivoUnidades = null;
    if (!unidades) {
      motivoUnidades = usuario.gerenciavel && !unidadesEditaveisNaVisao
        ? "Selecione uma Rede para editar unidades."
        : MOTIVOS_BLOQUEIO[usuario.motivo_bloqueio] || null;
    }
    return {
      papel: papelStatus && podeAlterarPapel,
      status: papelStatus && podeAlterarStatus,
      unidades,
      motivoPapelStatus: papelStatus ? null : MOTIVOS_BLOQUEIO[usuario.motivo_bloqueio] || "Sem permissão para alterar.",
      motivoUnidades,
    };
  }

  const permissoesSelecionado = usuarioAcesso ? permissoesDaLinha(usuarioAcesso) : null;

  return (
    <RoleGate
      permission={UI_PERMISSIONS.USUARIOS_VISUALIZAR}
      fallback={
        <Card className="ops-restricted">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <div className="ops-restricted__title">Área restrita a administradores.</div>
            <div className="ops-restricted__text">
              O seu perfil não gerencia usuários. Peça ao administrador da unidade para criar ou alterar acessos.
            </div>
          </div>
        </Card>
      }
    >
      <div className="ops-page">
        <Card className="ops-header">
          <div className="ops-header__main">
            <h1 className="ops-header__title">Usuários</h1>
            <p className="ops-header__meta">
              {nomeRede && <span className="ops-header__context">{nomeRede}</span>}
              {nomeRede && " · "}
              {usuarios.length} {usuarios.length === 1 ? "usuário" : "usuários"}, {ativos} {ativos === 1 ? "ativo" : "ativos"}
            </p>
          </div>
          <div className={`ops-header__actions ${contexto?.pode_escolher_rede ? "" : "ops-header__actions--single"}`}>
            {contexto?.pode_escolher_rede && (
              <Select
                aria-label="Rede"
                className="ops-header__select"
                value={redeFiltro}
                onChange={(event) => setRedeFiltro(event.target.value)}
              >
                <option value="">Todas as Redes</option>
                {(contexto.redes || []).map((rede) => (
                  <option key={rede.id} value={rede.id}>{rede.nome}</option>
                ))}
              </Select>
            )}
            <RoleGate permission={UI_PERMISSIONS.USUARIOS_CRIAR}>
              <Button onClick={() => setModalAberto(true)} disabled={!contexto}>
                <Plus size={16} aria-hidden="true" />
                Novo usuário
              </Button>
            </RoleGate>
          </div>

          {contexto && (
            <details
              className="ops-scope"
              open={escopoAberto}
              onToggle={(event) => setEscopoAberto(event.currentTarget.open)}
            >
              <summary>
                <ChevronRight size={16} aria-hidden="true" />
                Seu escopo de gestão
              </summary>
              <dl className="ops-scope__list">
                <div>
                  <dt>Seu papel</dt>
                  <dd>{getRoleLabel(user?.papel)}</dd>
                </div>
                <div>
                  <dt>Papéis que você atribui</dt>
                  <dd>{listarNomes(papeisAtribuiveis.map(getRoleLabel))}</dd>
                </div>
                <div>
                  <dt>Unidades que você gerencia</dt>
                  <dd>{listarNomes((contexto.unidades || []).map((unidade) => unidade.nome))}</dd>
                </div>
              </dl>
            </details>
          )}
        </Card>

        <Card className="ops-panel">
          {loading && usuarios.length === 0 ? (
            <EmptyState title="Carregando usuários..." />
          ) : usuarios.length === 0 ? (
            <EmptyState title="Nenhum usuário nesta Rede." />
          ) : (
            <Table className="ops-table ops-table--users">
              <thead>
                <tr>
                  <th scope="col">Usuário</th>
                  <th scope="col">Papel</th>
                  <th scope="col">Unidades autorizadas</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => {
                  const permissoes = permissoesDaLinha(usuario);
                  const gerenciavel = permissoes.papel || permissoes.status || permissoes.unidades;
                  const motivo = MOTIVOS_BLOQUEIO[usuario.motivo_bloqueio] || "Sem permissão para alterar.";
                  const ehVoce = usuario.motivo_bloqueio === "USUARIO_AUTOGESTAO_BLOQUEADA";
                  const identificacao = [usuario.login, usuario.email].filter(Boolean).join(" · ");

                  return (
                    <tr key={usuario.id}>
                      <td>
                        <div className="ops-user">
                          <span className="ops-user__name">
                            {usuario.nome}
                            {ehVoce && <span className="ops-user__you"> (você)</span>}
                          </span>
                          {identificacao && <span className="ops-user__id" title={identificacao}>{identificacao}</span>}
                        </div>
                      </td>
                      <td>{getRoleLabel(usuario.papel)}</td>
                      <td>
                        <Unidades unidades={usuario.unidades} papel={usuario.papel} />
                      </td>
                      <td>
                        <span className={`ops-status ${STATUS_CLASS[usuario.status] || ""}`}>
                          {STATUS_LABEL[usuario.status] || usuario.status}
                        </span>
                      </td>
                      <td className="ops-table__actions">
                        {usuario.vinculo_local_desativavel && podeAlterarUnidades && (
                          <Button size="sm" variant="danger" disabled={salvando} onClick={() => handleDesativarVinculo(usuario)}>
                            Desativar nesta unidade
                          </Button>
                        )}
                        {gerenciavel ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setUsuarioAcesso(usuario)}
                            aria-label={`Gerenciar acesso de ${usuario.nome}`}
                          >
                            Gerenciar acesso
                          </Button>
                        ) : (
                          <span className="ops-lock">
                            <Lock size={13} aria-hidden="true" />
                            {motivo}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        {(temVinculoLegado || (canManagePlatformUsers && !redeFiltro)) && (
          <p className="ops-footnote">
            {temVinculoLegado ? '* Vínculo criado antes da GS-03, de origem não confirmada. Revise em "Gerenciar acesso". ' : ""}
            {canManagePlatformUsers && !redeFiltro ? "Selecione uma Rede para editar unidades." : ""}
          </p>
        )}

        <UsuarioInternoModal
          open={modalAberto}
          onClose={() => setModalAberto(false)}
          onSubmit={handleCriarUsuario}
          loading={salvando}
          opcoes={contexto}
        />

        <GerenciarAcessoModal
          usuario={usuarioAcesso}
          opcoes={contexto}
          podeEditarPapel={permissoesSelecionado?.papel}
          podeEditarStatus={permissoesSelecionado?.status}
          podeEditarUnidades={permissoesSelecionado?.unidades}
          motivoPapelStatus={permissoesSelecionado?.motivoPapelStatus}
          motivoUnidades={permissoesSelecionado?.motivoUnidades}
          onClose={() => setUsuarioAcesso(null)}
          onSubmit={handleSalvarAcesso}
          loading={salvando}
        />
      </div>
    </RoleGate>
  );
}
