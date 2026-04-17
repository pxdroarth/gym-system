import React, { useEffect, useMemo, useState } from 'react';
import ToastNotification from '../../components/ToastNotification';
import { useNavigate, useParams } from 'react-router-dom';
import ModalNovaMensalidade from './ModalNovaMensalidade';
import { fetchAlunoById, fetchAcessos, fetchMensalidadesPorAluno, fetchPlanos, registrarPagamento, simularAcesso } from '../../services/Api';

function formatarData(data) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR');
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

  const resultadoTexto = { permitido: 'Permitido', negado: 'Negado' };
  const resultadoClasse = { permitido: 'text-green-700', negado: 'text-red-600' };

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

  if (erro) return <div className="p-4 text-red-600 font-bold">Erro: {erro}</div>;
  if (!aluno) return <div className="p-4">Carregando...</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-2 text-blue-700">Perfil de {aluno.nome}</h2>
      <ToastNotification message={toastMsg} onClose={() => setToastMsg(null)} />

      <div className="flex space-x-6 border-b mb-4">
        {['informacoes', 'mensalidades', 'acessos'].map((tab) => (
          <button
            key={tab}
            onClick={() => setAbaAtiva(tab)}
            className={`pb-2 ${abaAtiva === tab ? 'border-b-2 border-blue-600 font-semibold text-blue-600' : 'text-gray-600'}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {abaAtiva === 'informacoes' && (
        <div className="space-y-2">
          <p><strong>Matrícula:</strong> {aluno.matricula}</p>
          <p><strong>Nome:</strong> {aluno.nome}</p>
          <p><strong>Telefone:</strong> {aluno.telefone || '-'}</p>
          <p><strong>Data de Nascimento:</strong> {aluno.data_nascimento?.slice(0, 10)}</p>
          <p><strong>Status Cadastral:</strong> {aluno.status}</p>
          <p><strong>Status Operacional:</strong> {aluno.status_ativo}</p>
          <p><strong>Situação da Mensalidade:</strong> {aluno.mensalidade_status}</p>
          <p><strong>Plano Atual:</strong> {planoAtual?.nome || 'Sem plano'}</p>

          <div className="flex gap-3 pt-4 flex-wrap">
            <button onClick={() => navigate(`/alunos/editar/${aluno.id}`)} className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded">
              Editar Aluno
            </button>
            <button onClick={testarAcesso} disabled={simulandoAcesso} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50">
              {simulandoAcesso ? 'Testando acesso...' : 'Testar Acesso'}
            </button>
          </div>
        </div>
      )}

      {abaAtiva === 'mensalidades' && (
        <div>
          <div className="flex justify-between mb-2">
            <h3 className="font-semibold">Mensalidades ({totalMensalidades})</h3>
            <button onClick={() => setShowModal(true)} className="bg-green-600 text-white rounded px-4 py-2">
              + Registrar Mensalidade
            </button>
          </div>
          <table className="min-w-full border text-sm mb-2">
            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="p-2 border">Vencimento</th>
                <th className="p-2 border">Valor</th>
                <th className="p-2 border">Desconto</th>
                <th className="p-2 border">Status</th>
                <th className="p-2 border">Observações</th>
                <th className="p-2 border">Ações</th>
              </tr>
            </thead>
            <tbody>
              {mensalidades.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-2 border text-center">Nenhuma mensalidade encontrada.</td>
                </tr>
              ) : mensalidades.map((m) => (
                <tr key={m.id}>
                  <td className="p-2 border">{formatarData(m.vencimento)}</td>
                  <td className="p-2 border">R$ {Number(m.valor_cobrado || 0).toFixed(2)}</td>
                  <td className="p-2 border">R$ {Number(m.desconto_aplicado || 0).toFixed(2)}</td>
                  <td className={`p-2 border font-semibold ${m.status === 'pago' ? 'text-green-700' : 'text-red-600'}`}>{m.status}</td>
                  <td className="p-2 border">{m.observacoes || '-'}</td>
                  <td className="p-2 border">
                    {m.status === 'em_aberto' ? (
                      <button
                        onClick={() => pagarMensalidade(m)}
                        disabled={carregandoPagamentoId === m.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded disabled:opacity-50"
                      >
                        {carregandoPagamentoId === m.id ? 'Pagando...' : 'Pagar'}
                      </button>
                    ) : (
                      <span className="text-gray-500">Quitada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between">
            <button disabled={paginaMensalidade === 1} onClick={() => setPaginaMensalidade((p) => p - 1)} className="bg-gray-300 px-4 py-1 rounded disabled:opacity-50">Anterior</button>
            <button disabled={paginaMensalidade * 10 >= totalMensalidades} onClick={() => setPaginaMensalidade((p) => p + 1)} className="bg-gray-300 px-4 py-1 rounded disabled:opacity-50">Próxima</button>
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
        </div>
      )}

      {abaAtiva === 'acessos' && (
        <div>
          <h3 className="font-semibold mb-2">Total de Acessos: {totalAcessos}</h3>
          <table className="min-w-full border text-sm mb-2">
            <thead className="bg-blue-600 text-white">
              <tr>
                <th className="p-2 border">Data/Hora</th>
                <th className="p-2 border">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {acessos.length === 0 ? (
                <tr>
                  <td colSpan={2} className="p-2 border text-center">Nenhum acesso encontrado.</td>
                </tr>
              ) : acessos.map((acesso) => (
                <tr key={acesso.id}>
                  <td className="p-2 border">{new Date(acesso.data_hora).toLocaleString()}</td>
                  <td className={`p-2 border ${resultadoClasse[acesso.resultado] || 'text-gray-700'}`}>
                    {resultadoTexto[acesso.resultado] || acesso.resultado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between">
            <button disabled={paginaAcesso === 1} onClick={() => setPaginaAcesso((p) => p - 1)} className="bg-gray-300 px-4 py-1 rounded disabled:opacity-50">Anterior</button>
            <button disabled={paginaAcesso * 10 >= totalAcessos} onClick={() => setPaginaAcesso((p) => p + 1)} className="bg-gray-300 px-4 py-1 rounded disabled:opacity-50">Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}
