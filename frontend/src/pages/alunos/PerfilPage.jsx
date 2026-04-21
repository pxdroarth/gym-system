import React, { useEffect, useMemo, useState } from 'react';
import { Activity, CreditCard, Edit3, UserRound } from 'lucide-react';
import ToastNotification from '../../components/ToastNotification';
import { useNavigate, useParams } from 'react-router-dom';
import ModalNovaMensalidade from './ModalNovaMensalidade';
import {
  fetchAlunoById,
  fetchAcessos,
  fetchMensalidadesPorAluno,
  fetchPlanos,
  registrarPagamento,
  simularAcesso,
} from '../../services/Api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Table from '../../components/ui/Table';
import { TabButton, Tabs } from '../../components/ui/Tabs';

function formatarData(data) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function iniciais(nome) {
  return String(nome || 'SA')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

function badgeStatusAluno(status) {
  return String(status).toLowerCase() === 'ativo'
    ? <Badge tone="green">Ativo</Badge>
    : <Badge tone="red">Inativo</Badge>;
}

function badgeMensalidade(status) {
  const normalized = String(status || '').toLowerCase();
  if (['pago', 'em_dia'].includes(normalized)) return <Badge tone="green">{status}</Badge>;
  if (['em_aberto', 'parcial'].includes(normalized)) return <Badge tone="amber">{status}</Badge>;
  if (['vencido', 'atrasado', 'cancelado'].includes(normalized)) return <Badge tone="red">{status}</Badge>;
  return <Badge tone="gray">{status || '-'}</Badge>;
}

function badgeAcesso(resultado) {
  const normalized = String(resultado || '').toLowerCase();
  const permitido = normalized === 'permitido' || normalized === 'liberado';
  return <Badge tone={permitido ? 'green' : 'red'}>{permitido ? 'Permitido' : 'Negado'}</Badge>;
}

function InfoItem({ label, value }) {
  return (
    <div className="ui-info-item">
      <div className="ui-info-item__label">{label}</div>
      <div className="ui-info-item__value">{value || '-'}</div>
    </div>
  );
}

export default function PerfilPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [aluno, setAluno] = useState(null);
  const [erro, setErro] = useState(null);
  const [abaAtiva, setAbaAtiva] = useState('informacoes');
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
      setErro(err.message || 'Aluno não encontrado');
    }
  }

  async function carregarMensalidades() {
    try {
      const data = await fetchMensalidadesPorAluno(id, paginaMensalidade, 10);
      setMensalidades(data.mensalidades || []);
      setTotalMensalidades(data.total || 0);
    } catch {
      setMensalidades([]);
    }
  }

  async function carregarAcessos() {
    try {
      const data = await fetchAcessos(id, paginaAcesso, 10);
      setAcessos(data.acessos || []);
      setTotalAcessos(data.total || 0);
    } catch {
      setAcessos([]);
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

  const planoAtual = useMemo(() => planos.find((p) => p.id === aluno?.plano_id), [planos, aluno]);

  async function pagarMensalidade(mensalidade) {
    try {
      setCarregandoPagamentoId(mensalidade.id);
      await registrarPagamento({
        mensalidade_id: mensalidade.id,
        valor_pago: mensalidade.valor_cobrado,
        data_pagamento: new Date().toISOString().slice(0, 10),
      });

      setToastMsg('Pagamento registrado com sucesso.');
      await Promise.all([carregarAluno(), carregarMensalidades()]);
    } catch (error) {
      setToastMsg(error?.response?.data?.error || 'Erro ao registrar pagamento.');
    } finally {
      setCarregandoPagamentoId(null);
    }
  }

  async function testarAcesso() {
    try {
      setSimulandoAcesso(true);
      const resposta = await simularAcesso(Number(id));
      setToastMsg(resposta?.mensagem || 'Teste de acesso executado.');
      await carregarAcessos();
    } catch (error) {
      setToastMsg(error?.response?.data?.error || 'Erro ao simular acesso.');
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

      <Card>
        <div className="ui-profile-hero">
          <div className="ui-profile-hero__main">
            <div className="ui-profile-hero__avatar">{iniciais(aluno.nome)}</div>
            <div>
              <h1 className="ui-profile-hero__title">{aluno.nome}</h1>
              <div className="ui-profile-hero__meta">
                <Badge tone="blue">Matrícula {aluno.matricula || '-'}</Badge>
                {badgeStatusAluno(aluno.status_ativo)}
                {badgeMensalidade(aluno.mensalidade_status)}
                <Badge tone="gray">{planoAtual?.nome || 'Sem plano'}</Badge>
              </div>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap justify-end">
            <Button variant="secondary" onClick={() => navigate(`/alunos/editar/${aluno.id}`)}>
              <Edit3 size={15} /> Editar
            </Button>
            <Button onClick={testarAcesso} disabled={simulandoAcesso}>
              <Activity size={15} /> {simulandoAcesso ? 'Testando...' : 'Testar Acesso'}
            </Button>
          </div>
        </div>
      </Card>

      <Tabs>
        <TabButton active={abaAtiva === 'informacoes'} onClick={() => setAbaAtiva('informacoes')}>
          Informações
        </TabButton>
        <TabButton active={abaAtiva === 'mensalidades'} onClick={() => setAbaAtiva('mensalidades')}>
          Mensalidades
        </TabButton>
        <TabButton active={abaAtiva === 'acessos'} onClick={() => setAbaAtiva('acessos')}>
          Acessos
        </TabButton>
      </Tabs>

      {abaAtiva === 'informacoes' && (
        <Card className="p-5">
          <div className="ui-section-header px-0 pt-0">
            <div>
              <h2 className="ui-section-title">Dados do Aluno</h2>
              <p className="ui-section-subtitle">Informações cadastrais e operacionais principais.</p>
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
            <InfoItem label="Plano Atual" value={planoAtual?.nome || 'Sem plano'} />
          </div>
        </Card>
      )}

      {abaAtiva === 'mensalidades' && (
        <Card>
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Mensalidades</h2>
              <p className="ui-section-subtitle">{totalMensalidades} registro(s) financeiro(s) do aluno.</p>
            </div>
            <Button onClick={() => setShowModal(true)}>+ Registrar Mensalidade</Button>
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
                {mensalidades.map((m) => (
                  <tr key={m.id}>
                    <td>{formatarData(m.vencimento)}</td>
                    <td>{formatarMoeda(m.valor_cobrado)}</td>
                    <td>{formatarMoeda(m.desconto_aplicado)}</td>
                    <td>{badgeMensalidade(m.status)}</td>
                    <td>{m.observacoes || '-'}</td>
                    <td>
                      {m.status === 'em_aberto' ? (
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => pagarMensalidade(m)}
                          disabled={carregandoPagamentoId === m.id}
                        >
                          <CreditCard size={14} /> {carregandoPagamentoId === m.id ? 'Pagando...' : 'Pagar'}
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
                setToastMsg('Mensalidade registrada com sucesso');
                setPaginaMensalidade(1);
                await Promise.all([carregarAluno(), carregarMensalidades()]);
              }}
            />
          )}
        </Card>
      )}

      {abaAtiva === 'acessos' && (
        <Card>
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Histórico de Acessos</h2>
              <p className="ui-section-subtitle">{totalAcessos} tentativa(s) registrada(s).</p>
            </div>
            <Button onClick={testarAcesso} disabled={simulandoAcesso}>
              {simulandoAcesso ? 'Testando...' : 'Testar Acesso'}
            </Button>
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
                    <td>{new Date(acesso.data_hora).toLocaleString('pt-BR')}</td>
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
