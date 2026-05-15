import React, { useEffect, useMemo, useState } from "react";
import { Activity, CreditCard, Edit3, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import ToastNotification from "../../components/ToastNotification";
import ModalNovaMensalidade from "./ModalNovaMensalidade";
import {
  fetchAcessos,
  fetchAlunoById,
  fetchMensalidadesPorAluno,
  fetchPlanos,
  registrarPagamento,
  simularAcesso,
} from "../../services/Api";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Pagination from "../../components/ui/Pagination";
import Table from "../../components/ui/Table";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";

function formatarData(data) {
  if (!data) return "-";
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
  const { id } = useParams();
  const navigate = useNavigate();

  const [aluno, setAluno] = useState(null);
  const [erro, setErro] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState("informacoes");
  const [mensalidades, setMensalidades] = useState([]);
  const [totalMensalidades, setTotalMensalidades] = useState(0);
  const [paginaMensalidade, setPaginaMensalidade] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [planos, setPlanos] = useState([]);
  const [acessos, setAcessos] = useState([]);
  const [paginaAcesso, setPaginaAcesso] = useState(1);
  const [totalAcessos, setTotalAcessos] = useState(0);
  const [toastMsg, setToastMsg] = useState(null);
  const [carregandoPagamentoId, setCarregandoPagamentoId] = useState(null);
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
  const ultimoAcesso = acessos[0]?.data_hora ? new Date(acessos[0].data_hora).toLocaleString("pt-BR") : "Sem registros";
  const mensalidadesPendentes = mensalidades.filter((mensalidade) => mensalidade.status === "em_aberto" || mensalidade.status === "parcial").length;

  async function pagarMensalidade(mensalidade) {
    try {
      setCarregandoPagamentoId(mensalidade.id);
      await registrarPagamento({
        mensalidade_id: mensalidade.id,
        valor_pago: mensalidade.valor_cobrado,
        data_pagamento: new Date().toISOString().slice(0, 10),
      });

      setToastMsg("Pagamento registrado com sucesso.");
      await Promise.all([carregarAluno(), carregarMensalidades()]);
    } catch (error) {
      setToastMsg(getApiErrorMessage(error));
    } finally {
      setCarregandoPagamentoId(null);
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

  if (erro) return <Card className="p-4 text-red-700 font-bold">Erro: {erro}</Card>;
  if (!aluno) return <Card className="p-4">Carregando perfil...</Card>;

  const totalPaginasMensalidades = Math.max(1, Math.ceil(totalMensalidades / 10));
  const totalPaginasAcessos = Math.max(1, Math.ceil(totalAcessos / 10));

  return (
    <div className="space-y-6">
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
                  {badgeMensalidade(aluno.mensalidade_status)}
                  <Badge tone="gray">{planoAtual?.nome || "Sem plano"}</Badge>
                </div>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={() => navigate(`/alunos/editar/${aluno.id}`)}>
                <Edit3 size={15} /> Editar
              </Button>
              <Button onClick={testarAcesso} disabled={simulandoAcesso}>
                <Activity size={15} /> {simulandoAcesso ? "Testando..." : "Testar Acesso"}
              </Button>
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
              <div className="profile-hero__stat-label">Pendências</div>
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
                <h2 className="ui-section-title">Resumo operacional do aluno</h2>
                <p className="ui-section-subtitle">Leitura principal do cadastro, situação e plano ativo.</p>
              </div>
            </div>
            <div className="ui-info-grid mt-5">
              <InfoItem label="Matrícula" value={aluno.matricula} />
              <InfoItem label="Nome" value={aluno.nome} />
              <InfoItem label="Telefone" value={aluno.telefone} />
              <InfoItem label="Data de Nascimento" value={aluno.data_nascimento?.slice(0, 10)} />
              <InfoItem label="Status Cadastral" value={aluno.status} />
              <InfoItem label="Status Operacional" value={aluno.status_ativo} />
              <InfoItem label="Situação da Mensalidade" value={aluno.mensalidade_status} />
              <InfoItem label="Plano Atual" value={planoAtual?.nome || "Sem plano"} />
            </div>
          </Card>

          <Card className="profile-side-card">
            <h3 className="profile-side-card__title">Visão rápida</h3>
            <p className="profile-side-card__copy">Bloco de leitura rápida para operação da unidade, sem alterar regras do domínio.</p>

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
              <Button onClick={() => setShowModal(true)}>+ Registrar Mensalidade</Button>
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
                      {mensalidade.status === "em_aberto" ? (
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => pagarMensalidade(mensalidade)}
                          disabled={carregandoPagamentoId === mensalidade.id}
                        >
                          <CreditCard size={14} /> {carregandoPagamentoId === mensalidade.id ? "Pagando..." : "Pagar"}
                        </Button>
                      ) : (
                        <Badge tone="green">Quitada</Badge>
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
                    <td>{new Date(acesso.data_hora).toLocaleString("pt-BR")}</td>
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
