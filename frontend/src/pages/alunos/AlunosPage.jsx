import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, CircleSlash, Users, WalletCards } from 'lucide-react';
import { fetchAlunos } from '../../services/Api';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import KpiCard from '../../components/ui/KpiCard';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import Table from '../../components/ui/Table';

const ORDER = (import.meta.env?.VITE_ALUNOS_ORDER || 'asc').toLowerCase();

function obterBadgeMensalidade(status) {
  switch (status) {
    case 'em_dia':
      return <Badge tone="green">Em dia</Badge>;
    case 'atrasado':
      return <Badge tone="red">Atrasado</Badge>;
    case 'sem_mensalidade':
      return <Badge tone="gray">Sem mensalidade</Badge>;
    default:
      return <Badge tone="gray">{status || '-'}</Badge>;
  }
}

function obterBadgeStatus(status) {
  return String(status).toLowerCase() === 'ativo'
    ? <Badge tone="green">Ativo</Badge>
    : <Badge tone="red">Inativo</Badge>;
}

export default function AlunosPage() {
  const [alunos, setAlunos] = useState([]);
  const [busca, setBusca] = useState('');
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    carregarAlunos();
  }, []);

  async function carregarAlunos() {
    try {
      const dados = await fetchAlunos();
      const normalizados = (dados || []).map((a) => ({
        ...a,
        status_ativo: a.status_ativo || a.status || 'inativo',
        mensalidade_status: a.mensalidade_status || 'sem_mensalidade',
      }));

      normalizados.sort((a, b) => {
        const va = Number(a.matricula || a.id || 0);
        const vb = Number(b.matricula || b.id || 0);
        return ORDER === 'desc' ? vb - va : va - vb;
      });

      setAlunos(normalizados);
      setPaginaAtual(1);
    } catch (error) {
      console.error('Erro ao buscar alunos:', error);
    }
  }

  const totalAlunos = alunos.length;
  const totalEmDia = alunos.filter((a) => a.mensalidade_status === 'em_dia').length;
  const totalAtrasados = alunos.filter((a) => a.mensalidade_status === 'atrasado').length;
  const totalSemMensalidade = alunos.filter((a) => a.mensalidade_status === 'sem_mensalidade').length;

  const termo = busca.toLowerCase();
  const alunosFiltrados = alunos.filter(
    (a) => (a.nome || '').toLowerCase().includes(termo) || String(a.matricula || '').includes(busca)
  );

  const indexUltimoItem = paginaAtual * itensPorPagina;
  const indexPrimeiroItem = indexUltimoItem - itensPorPagina;
  const alunosPaginados = alunosFiltrados.slice(indexPrimeiroItem, indexUltimoItem);
  const totalPaginas = Math.max(1, Math.ceil(alunosFiltrados.length / itensPorPagina));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        subtitle="Cadastro, situação operacional e acompanhamento de mensalidades."
        actions={
          <Button as={Link} to="/alunos/novo" variant="primary">
            + Novo Aluno
          </Button>
        }
      />

      <div className="ui-status-grid">
        <KpiCard label="Total de Alunos" value={totalAlunos} icon={<Users size={20} />} tone="blue" />
        <KpiCard label="Em Dia" value={totalEmDia} icon={<CheckCircle2 size={20} />} tone="green" />
        <KpiCard label="Atrasados" value={totalAtrasados} icon={<CircleSlash size={20} />} tone="red" />
        <KpiCard label="Sem Mensalidade" value={totalSemMensalidade} icon={<WalletCards size={20} />} tone="gray" />
      </div>

      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Lista de Alunos</h2>
            <p className="ui-section-subtitle">{alunosFiltrados.length} registro(s) encontrado(s).</p>
          </div>
          <div className="w-full max-w-sm">
            <Input
              type="text"
              placeholder="Buscar por nome ou matrícula"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPaginaAtual(1);
              }}
            />
          </div>
        </div>

        {alunosPaginados.length === 0 ? (
          <EmptyState title="Nenhum aluno encontrado." description="Tente ajustar a busca ou cadastre um novo aluno." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Mensalidade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {alunosPaginados.map((aluno) => (
                <tr key={aluno.id}>
                  <td className="font-mono text-sm">{aluno.matricula}</td>
                  <td className="font-semibold">{aluno.nome}</td>
                  <td>{obterBadgeStatus(aluno.status_ativo)}</td>
                  <td>{obterBadgeMensalidade(aluno.mensalidade_status)}</td>
                  <td>
                    <Button size="sm" onClick={() => navigate(`/alunos/${aluno.id}`)}>
                      Perfil
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div className="px-5 pb-5">
          <Pagination page={paginaAtual} totalPages={totalPaginas} onPageChange={setPaginaAtual} />
        </div>
      </Card>
    </div>
  );
}
