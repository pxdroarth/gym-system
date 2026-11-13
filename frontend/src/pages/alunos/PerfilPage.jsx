import React, { useEffect, useMemo, useRef, useState } from "react";
import { Activity, CalendarPlus, CreditCard, Edit3, Phone, ShieldCheck, UserRound } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ToastNotification from "../../components/ToastNotification";
import { accessDateTime, allowedAccess } from "../../components/AccessHistory";
import useAuth from "../../hooks/useAuth";
import ModalContratarRenovarPlano from "./ModalContratarRenovarPlano";
import Modal from "../../components/ui/Modal";
import { nomePoliticaMensal } from "../../utils/politicaMensal";
import ModalNovaMensalidade from "./ModalNovaMensalidade";
import { fetchAcessos, simularAcesso } from "../../services/acessoService";
import { fetchAlunoById } from "../../services/alunoService";
import { fetchMensalidadesPorAluno, emitirMensalidadePadrao, preverMensalidadePadrao, concederDescontoMensalidade } from "../../services/mensalidadeService";
import { registrarPagamento } from "../../services/pagamentoService";
import { fetchPlanos } from "../../services/planoService";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import Table from "../../components/ui/Table";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import { UI_PERMISSIONS, userHasUiPermission } from "../../utils/permissions";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import {
  abrirTentativa,
  encerrarTentativa,
  falhaSemConfirmacao,
  tentativaPendente,
} from "../../utils/tentativaPagamento";

function formatarData(data) {
  if (!data) return "-";
  const dataCivil = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (dataCivil) return `${dataCivil[3]}/${dataCivil[2]}/${dataCivil[1]}`;
  return new Date(data).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function iniciais(nome) {
  return String(nome || "SA")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function badgeStatusAluno(status) {
  return String(status).toLowerCase() === "ativo"
    ? <Badge tone="green">Ativo</Badge>
    : <Badge tone="red">Inativo</Badge>;
}

function badgeMensalidade(status) {
  const normalized = String(status || "").toLowerCase();
  if (["pago", "em_dia"].includes(normalized)) return <Badge tone="green">{status}</Badge>;
  if (["em_aberto", "parcial"].includes(normalized)) return <Badge tone="amber">{status}</Badge>;
  if (["vencido", "atrasado", "cancelado"].includes(normalized)) return <Badge tone="red">{status}</Badge>;
  return <Badge tone="gray">{status || "-"}</Badge>;
}

function temCampoCobertura(aluno) {
  return Object.prototype.hasOwnProperty.call(aluno || {}, "cobertura_paga_vigente")
    || Object.prototype.hasOwnProperty.call(aluno || {}, "cobertura_status");
}

function possuiCoberturaPaga(aluno) {
  return aluno?.cobertura_paga_vigente === true
    || aluno?.cobertura_paga_vigente === 1
    || aluno?.cobertura_status === "cobertura_paga_vigente";
}

function textoCobertura(aluno) {
  if (possuiCoberturaPaga(aluno)) return "Cobertura paga vigente";
  if (!temCampoCobertura(aluno)) return "Cobertura nao informada";
  return "Sem cobertura paga vigente";
}

function periodoCobertura(aluno) {
  if (!possuiCoberturaPaga(aluno)) return null;
  if (!aluno.cobertura_data_inicio && !aluno.cobertura_data_fim) return null;
  return `${formatarData(aluno.cobertura_data_inicio)} a ${formatarData(aluno.cobertura_data_fim)}`;
}

function badgeCobertura(aluno) {
  if (possuiCoberturaPaga(aluno)) return <Badge tone="green">Cobertura paga vigente</Badge>;
  if (!temCampoCobertura(aluno)) return <Badge tone="gray">Cobertura nao informada</Badge>;
  return <Badge tone="amber">Sem cobertura paga vigente</Badge>;
}

function badgeAcaoMensalidade(mensalidade) {
  const status = String(mensalidade?.status || "").toLowerCase();
  if (status === "pago") return <Badge tone="green">Quitada</Badge>;
  if (status === "parcial") return <Badge tone="amber">Parcial</Badge>;
  if (status === "cancelado" || status === "vencido") return <Badge tone="red">{mensalidade.status}</Badge>;
  return <Badge tone="gray">{mensalidade?.status || "-"}</Badge>;
}

function badgeAcesso(resultado) {
  const normalized = String(resultado || "").toLowerCase();
  const permitido = normalized === "permitido" || normalized === "liberado";
  return <Badge tone={permitido ? "green" : "red"}>{permitido ? "Permitido" : "Negado"}</Badge>;
}

function InfoItem({ label, value }) {
  return (
    <div className="ui-info-item">
      <div className="ui-info-item__label">{label}</div>
      <div className="ui-info-item__value">{value || "-"}</div>
    </div>
  );
}

export default function PerfilPage() {
  const { user, currentUnit } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();

  const [aluno, setAluno] = useState(null);
  const [erro, setErro] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState("informacoes");
  const [previaPadrao, setPreviaPadrao] = useState(null);
  const [valoresPagamento, setValoresPagamento] = useState({});
  const [emitindoMensalidade, setEmitindoMensalidade] = useState(false);
  const [mensalidades, setMensalidades] = useState([]);
  const [totalMensalidades, setTotalMensalidades] = useState(0);
  const [paginaMensalidade, setPaginaMensalidade] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [showModalContratarRenovar, setShowModalContratarRenovar] = useState(false);
  const [planos, setPlanos] = useState([]);
  const [acessos, setAcessos] = useState([]);
  const [paginaAcesso, setPaginaAcesso] = useState(1);
  const [totalAcessos, setTotalAcessos] = useState(0);
  const [toastMsg, setToastMsg] = useState(null);
  const [carregandoPagamentoId, setCarregandoPagamentoId] = useState(null);
  // Trava sincrona contra clique duplo: o estado do React so atualiza no
  // proximo render, entao dois cliques rapidos passariam pelo `disabled`.
  const pagamentosEmAndamento = useRef(new Set());
  const [, setVersaoTentativas] = useState(0);
  const [simulandoAcesso, setSimulandoAcesso] = useState(false);

  async function carregarAluno() {
    try {
      const data = await fetchAlunoById(id);
      setAluno(data);
      setErro(null);
    } catch (err) {
      setErro(getApiErrorMessage(err));
    }
  }

  async function carregarMensalidades() {
    try {
      const data = await fetchMensalidadesPorAluno(id, paginaMensalidade, 10);
      setMensalidades(data.mensalidades || []);
      setTotalMensalidades(data.total || 0);
    } catch (error) {
      setMensalidades([]);
      setToastMsg(getApiErrorMessage(error));
    }
  }

  async function carregarAcessos() {
    try {
      const data = await fetchAcessos(id, paginaAcesso, 10);
      setAcessos(data.acessos || []);
      setTotalAcessos(data.total || 0);
    } catch (error) {
      setAcessos([]);
      setToastMsg(getApiErrorMessage(error));
    }
  }

  useEffect(() => {
    carregarAluno();
  }, [id]);

  useEffect(() => {
    carregarMensalidades();
  }, [id, paginaMensalidade]);

  useEffect(() => {
    carregarAcessos();
  }, [id, paginaAcesso]);

  useEffect(() => {
    fetchPlanos().then(setPlanos).catch(() => setPlanos([]));
  }, []);

  const planoAtual = useMemo(() => planos.find((plano) => plano.id === aluno?.plano_id), [planos, aluno]);
  const ultimoAcesso = acessos[0]?.data_hora ? accessDateTime(acessos[0].data_hora) : "Sem registros";
  const mensalidadesPendentes = mensalidades.filter((mensalidade) => mensalidade.status === "em_aberto" || mensalidade.status === "parcial").length;
  const canRegistrarPagamento = userHasUiPermission(user, UI_PERMISSIONS.PAGAMENTOS_REGISTRAR);
  const canContratarRenovar = userHasUiPermission(user, UI_PERMISSIONS.PLANOS_CONTRATAR_RENOVAR) && canRegistrarPagamento;
  const canLancamentoManualMensalidade = userHasUiPermission(user, UI_PERMISSIONS.MENSALIDADES_GERENCIAR);
  const canEmitirMensalidadePadrao = userHasUiPermission(user, UI_PERMISSIONS.MENSALIDADES_EMITIR_PADRAO);
  const canConcederDesconto = userHasUiPermission(user, UI_PERMISSIONS.MENSALIDADES_DESCONTO);

  async function concederDesconto(mensalidade) {
    const valor = window.prompt("Valor do desconto excepcional");
    if (!valor) return;
    const motivo = window.prompt("Motivo do desconto excepcional");
    if (!motivo?.trim()) return;
    try {
      await concederDescontoMensalidade(mensalidade.id, {
        desconto: valor,
        motivo,
        valor_cobrado_esperado: mensalidade.valor_cobrado,
      });
      setToastMsg("Desconto registrado.");
      await carregarMensalidades();
    } catch (error) {
      setToastMsg(getApiErrorMessage(error));
    }
  }

  const canEditarAluno = userHasUiPermission(user, UI_PERMISSIONS.ALUNOS_EDITAR);

  async function gerarMensalidadePadrao() {
    setEmitindoMensalidade(true);
    try {
      if (!previaPadrao) {
        setPreviaPadrao(await preverMensalidadePadrao(aluno.id));
        return;
      }
      await emitirMensalidadePadrao(aluno.id, previaPadrao);
      setPreviaPadrao(null);
      setToastMsg("Cobrança padrão disponível.");
      setPaginaMensalidade(1);
      await Promise.all([carregarAluno(), carregarMensalidades()]);
    } catch (error) {
      setPreviaPadrao(null);
      setToastMsg(getApiErrorMessage(error));
    } finally {
      setEmitindoMensalidade(false);
    }
  }

  async function pagarMensalidade(mensalidade) {
    if (pagamentosEmAndamento.current.has(mensalidade.id)) return;
    pagamentosEmAndamento.current.add(mensalidade.id);
    setCarregandoPagamentoId(mensalidade.id);

    const saldo = Number(mensalidade.saldo_em_aberto ?? mensalidade.valor_cobrado);
    const valor = valoresPagamento[mensalidade.id];
    const tentativa = tentativaPendente(mensalidade.id) || abrirTentativa(mensalidade.id, {
      mensalidade_id: mensalidade.id,
      valor_pago: valor ? Number(valor) : saldo,
    });

    try {
      const resultado = await registrarPagamento(tentativa.payload, tentativa.chave);
      encerrarTentativa(mensalidade.id);
      setValoresPagamento((valores) => ({ ...valores, [mensalidade.id]: "" }));
      setToastMsg(resultado?.idempotente
        ? "Pagamento ja registrado anteriormente; nenhum valor foi lancado de novo."
        : "Pagamento registrado com sucesso.");
      await Promise.all([carregarAluno(), carregarMensalidades()]);
    } catch (error) {
      if (falhaSemConfirmacao(error)) {
        setToastMsg("Sem confirmacao do servidor. Clique em \"Reenviar pagamento\": o mesmo pedido sera reenviado sem duplicar.");
      } else {
        encerrarTentativa(mensalidade.id);
        setToastMsg(getApiErrorMessage(error));
        await carregarMensalidades();
      }
    } finally {
      pagamentosEmAndamento.current.delete(mensalidade.id);
      setCarregandoPagamentoId(null);
      setVersaoTentativas((v) => v + 1);
    }
  }

  async function testarAcesso() {
    try {
      setSimulandoAcesso(true);
      const resposta = await simularAcesso(Number(id));
      setToastMsg(resposta?.mensagem || "Teste de acesso executado.");
      await carregarAcessos();
    } catch (error) {
      setToastMsg(getApiErrorMessage(error));
    } finally {
      setSimulandoAcesso(false);
    }
  }

  async function finalizarContratacaoRenovacao() {
    setToastMsg("Contratacao/renovacao registrada com sucesso.");
    setPaginaMensalidade(1);
    await Promise.all([carregarAluno(), carregarMensalidades(), carregarAcessos()]);
  }

  if (erro) return <Card className="p-4 text-red-700 font-bold">Erro: {erro}</Card>;
  if (!aluno) return <Card className="p-4">Carregando perfil...</Card>;

  const totalPaginasMensalidades = Math.max(1, Math.ceil(totalMensalidades / 10));
  const totalPaginasAcessos = Math.max(1, Math.ceil(totalAcessos / 10));

  return (
    <div className="gym-module">
      <nav aria-label="Localização"><Link className="gym-back-link" to="/alunos">Alunos</Link> <span aria-hidden="true">›</span> Perfil do Aluno</nav>
      <PageHeader title="Perfil do Aluno" subtitle={currentUnit?.nome} actions={<>
        {canEditarAluno && <Button variant="secondary" onClick={() => navigate(`/alunos/editar/${aluno.id}`)}><Edit3 size={15} /> Editar aluno</Button>}
        <Button onClick={testarAcesso} disabled={simulandoAcesso}><Activity size={15} /> {simulandoAcesso ? "Testando…" : "Testar acesso"}</Button>
      </>} />
      <ToastNotification message={toastMsg} onClose={() => setToastMsg(null)} />

      <Card className="profile-hero">
        <div className="profile-hero__content">
          <div className="profile-hero__panel">
            <div className="ui-profile-hero__main">
              <div className="ui-profile-hero__avatar">{iniciais(aluno.nome)}</div>
              <div>
                <h1 className="ui-profile-hero__title">{aluno.nome}</h1>
                <div className="profile-hero__badges">
                  <Badge tone="blue">Matrícula {aluno.matricula || "-"}</Badge>
                  {badgeStatusAluno(aluno.status_ativo)}
                  {badgeCobertura(aluno)}
                  <Badge tone="gray">{planoAtual?.nome || "Sem plano"}</Badge>
                </div>
              </div>
            </div>

          </div>

          <div className="profile-hero__stats">
            <div className="profile-hero__stat">
              <div className="profile-hero__stat-label">Plano atual</div>
              <div className="profile-hero__stat-value">{planoAtual?.nome || "Sem plano"}</div>
            </div>
            <div className="profile-hero__stat">
              <div className="profile-hero__stat-label">Último acesso</div>
              <div className="profile-hero__stat-value text-base leading-snug">{ultimoAcesso}</div>
            </div>
            <div className="profile-hero__stat">
              <div className="profile-hero__stat-label">Pendências na página de mensalidades</div>
              <div className="profile-hero__stat-value">{mensalidadesPendentes}</div>
            </div>
            <div className="profile-hero__stat">
              <div className="profile-hero__stat-label">Contato</div>
              <div className="profile-hero__stat-value text-base leading-snug">{aluno.telefone || "Não informado"}</div>
            </div>
          </div>
        </div>
      </Card>

      <Tabs>
        <TabButton active={abaAtiva === "informacoes"} onClick={() => setAbaAtiva("informacoes")}>
          Informações
        </TabButton>
        <TabButton active={abaAtiva === "mensalidades"} onClick={() => setAbaAtiva("mensalidades")}>
          Mensalidades
        </TabButton>
        <TabButton active={abaAtiva === "acessos"} onClick={() => setAbaAtiva("acessos")}>
          Acessos
        </TabButton>
      </Tabs>

      {abaAtiva === "informacoes" && (
        <div className="profile-grid">
          <Card className="p-5">
            <div className="ui-section-header px-0 pt-0">
              <div>
                <h2 className="ui-section-title">Informações pessoais e operacionais</h2>
                <p className="ui-section-subtitle">Cadastro, situação e plano atual.</p>
              </div>
            </div>
            <div className="ui-info-grid mt-5">
              <InfoItem label="Matrícula" value={aluno.matricula} />
              <InfoItem label="Nome" value={aluno.nome} />
              <InfoItem label="Telefone" value={aluno.telefone} />
              <InfoItem label="Data de Nascimento" value={aluno.data_nascimento?.slice(0, 10)} />
              <InfoItem label="Status Cadastral" value={aluno.status} />
              <InfoItem label="Status Operacional" value={aluno.status_ativo} />
              <InfoItem label="Cobertura" value={periodoCobertura(aluno) || textoCobertura(aluno)} />
              <InfoItem label="Mensalidade (admin)" value={aluno.mensalidade_status} />
              <InfoItem label="Plano Atual" value={planoAtual?.nome || "Sem plano"} />
            </div>
          </Card>

          <Card className="profile-side-card">
            <h3 className="profile-side-card__title">Contato e situação</h3>

            <div className="profile-side-list">
              <div className="profile-side-list__item">
                <div className="profile-side-list__label">
                  <ShieldCheck size={12} className="inline mr-1" />
                  Status operacional
                </div>
                <div className="profile-side-list__value">{aluno.status_ativo || "-"}</div>
              </div>
              <div className="profile-side-list__item">
                <div className="profile-side-list__label">
                  <Phone size={12} className="inline mr-1" />
                  Contato
                </div>
                <div className="profile-side-list__value">{aluno.telefone || "Não informado"}</div>
              </div>
              <div className="profile-side-list__item">
                <div className="profile-side-list__label">
                  <UserRound size={12} className="inline mr-1" />
                  Situação cadastral
                </div>
                <div className="profile-side-list__value">{aluno.status || "-"}</div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {abaAtiva === "informacoes" && (
        <div className="gym-columns">
          <Card className="gym-panel">
            <div className="gym-panel__head">
              <h2 className="ui-section-title">Últimas mensalidades</h2>
              <Button size="sm" variant="secondary" onClick={() => setAbaAtiva("mensalidades")}>Ver mensalidades</Button>
            </div>
            <Table><thead><tr><th>Vencimento</th><th>Valor</th><th>Situação</th></tr></thead>
              <tbody>{mensalidades.length ? mensalidades.slice(0, 3).map((item) => <tr key={item.id}>
                <td>{formatarData(item.vencimento)}</td><td>{formatarMoeda(item.valor_cobrado)}</td><td>{badgeMensalidade(item.status)}</td>
              </tr>) : <tr><td colSpan={3}>Nenhuma mensalidade registrada.</td></tr>}</tbody>
            </Table>
          </Card>
          <Card className="gym-panel">
            <div className="gym-panel__head">
              <h2 className="ui-section-title">Últimos acessos</h2>
              <Button size="sm" variant="secondary" onClick={() => setAbaAtiva("acessos")}>Ver acessos</Button>
            </div>
            <Table><thead><tr><th>Data</th><th>Resultado</th></tr></thead>
              <tbody>{acessos.length ? acessos.slice(0, 3).map((item) => <tr key={item.id}>
                <td>{accessDateTime(item.data_hora)}</td><td><Badge tone={allowedAccess(item) ? "green" : "red"}>{allowedAccess(item) ? "Permitido" : "Negado"}</Badge></td>
              </tr>) : <tr><td colSpan={2}>Nenhum acesso registrado.</td></tr>}</tbody>
            </Table>
          </Card>
        </div>
      )}

      {abaAtiva === "mensalidades" && (
        <Card>
          <div className="entity-toolbar">
            <div className="entity-toolbar__intro">
              <span className="entity-toolbar__eyebrow">Mensalidades</span>
              <div>
                <h2 className="ui-section-title">Histórico financeiro do aluno</h2>
                <p className="ui-section-subtitle">{totalMensalidades} registro(s) do aluno no fluxo atual.</p>
              </div>
            </div>
            <div className="entity-toolbar__actions">
              {canContratarRenovar ? (
                <Button
                  onClick={() => setShowModalContratarRenovar(true)}
                  disabled={!aluno.plano_id}
                  title={!aluno.plano_id ? "Selecione um plano no cadastro do aluno antes de contratar/renovar." : undefined}
                >
                  <CalendarPlus size={15} /> Contratar/Renovar plano
                </Button>
              ) : null}
              {!aluno.plano_id && canContratarRenovar ? <Badge tone="amber">Aluno sem plano</Badge> : null}
              {previaPadrao && (
                <Modal title="Prévia da mensalidade" onClose={() => setPreviaPadrao(null)}>
                  <p>{nomePoliticaMensal(previaPadrao.politica)}</p>
                  <p>{formatarMoeda(previaPadrao.valor_cobrado)} · {formatarData(previaPadrao.data_inicio)} a {formatarData(previaPadrao.data_fim)}</p>
                  <p>Próximo ciclo em {formatarData(previaPadrao.proximo_vencimento)}</p>
                  <Button onClick={gerarMensalidadePadrao} disabled={emitindoMensalidade}>
                    {previaPadrao.cobranca_existente ? "Usar cobrança existente" : "Confirmar emissão"}
                  </Button>
                </Modal>
              )}
              {canEmitirMensalidadePadrao && (
                <Button onClick={gerarMensalidadePadrao} disabled={!aluno.plano_id || emitindoMensalidade}>
                  {emitindoMensalidade ? "Gerando…" : "Gerar Mensalidade"}
                </Button>
              )}
              {canLancamentoManualMensalidade ? (
                <div className="max-w-xs text-right">
                  <Button variant="ghost" onClick={() => setShowModal(true)}>
                    Lancamento manual de mensalidade
                  </Button>
                  <p className="mt-1 text-xs text-slate-500">
                    Uso administrativo. Cria mensalidade sem pagamento acoplado e nao gera cobertura paga automaticamente.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {mensalidades.length === 0 ? (
            <EmptyState title="Nenhuma mensalidade encontrada." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Desconto</th>
                  <th>Status</th>
                  <th>Observações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {mensalidades.map((mensalidade) => (
                  <tr key={mensalidade.id}>
                    <td>{formatarData(mensalidade.vencimento)}</td>
                    <td>{formatarMoeda(mensalidade.valor_cobrado)}</td>
                    <td>{formatarMoeda(mensalidade.desconto_aplicado)}</td>
                    <td>{badgeMensalidade(mensalidade.status)}</td>
                    <td>{mensalidade.observacoes || "-"}</td>
                    <td>
                      {canConcederDesconto && ["em_aberto", "vencido"].includes(mensalidade.status) && (
                        <Button size="sm" variant="ghost" onClick={() => concederDesconto(mensalidade)}>
                          Conceder desconto
                        </Button>
                      )}
                      {["em_aberto", "parcial", "vencido"].includes(mensalidade.status) && canRegistrarPagamento ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="ui-input w-28"
                            type="number" min="0.01" step="0.01"
                            aria-label="Valor do recebimento"
                            placeholder={String(mensalidade.saldo_em_aberto ?? mensalidade.valor_cobrado)}
                            value={tentativaPendente(mensalidade.id)?.payload.valor_pago ?? valoresPagamento[mensalidade.id] ?? ""}
                            disabled={Boolean(tentativaPendente(mensalidade.id)) || carregandoPagamentoId === mensalidade.id}
                            onChange={(event) => {
                              const valor = event.target.value;
                              setValoresPagamento((valores) => ({ ...valores, [mensalidade.id]: valor }));
                            }}
                          />
                          <Button
                          size="sm"
                          variant="success"
                          onClick={() => pagarMensalidade(mensalidade)}
                          disabled={carregandoPagamentoId === mensalidade.id}
                          aria-busy={carregandoPagamentoId === mensalidade.id}
                          data-testid={`pagar-mensalidade-${mensalidade.id}`}
                        >
                          <CreditCard size={14} />{" "}
                          {carregandoPagamentoId === mensalidade.id
                            ? "Pagando..."
                            : tentativaPendente(mensalidade.id)
                              ? "Reenviar pagamento"
                              : mensalidade.status === "parcial"
                                ? `Pagar saldo ${formatarMoeda(mensalidade.saldo_em_aberto)}`
                                : "Pagar"}
                          </Button>
                        </div>
                      ) : mensalidade.status === "em_aberto" ? (
                        <Badge tone="amber">Em aberto</Badge>
                      ) : (
                        badgeAcaoMensalidade(mensalidade)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <div className="px-5 pb-5">
            <Pagination
              page={paginaMensalidade}
              totalPages={totalPaginasMensalidades}
              onPageChange={setPaginaMensalidade}
              canNext={paginaMensalidade * 10 < totalMensalidades}
            />
          </div>

          {showModal && (
            <ModalNovaMensalidade
              open={showModal}
              aluno={aluno}
              onClose={() => setShowModal(false)}
              onSuccess={async () => {
                setToastMsg("Mensalidade registrada com sucesso");
                setPaginaMensalidade(1);
                await Promise.all([carregarAluno(), carregarMensalidades()]);
              }}
            />
          )}

          {showModalContratarRenovar && (
            <ModalContratarRenovarPlano
              open={showModalContratarRenovar}
              aluno={aluno}
              plano={planoAtual}
              onClose={() => setShowModalContratarRenovar(false)}
              onSuccess={finalizarContratacaoRenovacao}
            />
          )}
        </Card>
      )}

      {abaAtiva === "acessos" && (
        <Card>
          <div className="entity-toolbar">
            <div className="entity-toolbar__intro">
              <span className="entity-toolbar__eyebrow">Acessos</span>
              <div>
                <h2 className="ui-section-title">Histórico de acessos</h2>
                <p className="ui-section-subtitle">{totalAcessos} tentativa(s) registrada(s) para este aluno.</p>
              </div>
            </div>
            <div className="entity-toolbar__actions">
              <Button onClick={testarAcesso} disabled={simulandoAcesso}>
                {simulandoAcesso ? "Testando..." : "Testar Acesso"}
              </Button>
            </div>
          </div>

          {acessos.length === 0 ? (
            <EmptyState title="Nenhum acesso encontrado." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {acessos.map((acesso) => (
                  <tr key={acesso.id}>
                    <td>{accessDateTime(acesso.data_hora)}</td>
                    <td>{badgeAcesso(acesso.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <div className="px-5 pb-5">
            <Pagination
              page={paginaAcesso}
              totalPages={totalPaginasAcessos}
              onPageChange={setPaginaAcesso}
              canNext={paginaAcesso * 10 < totalAcessos}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
