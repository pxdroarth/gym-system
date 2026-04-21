import React, { useEffect, useState } from 'react';
import { Activity, UserCheck, Users, UserX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchAlunos, fetchTodosAcessos } from '../services/Api';
import ModalAcessosHoje from '../components/ModalAcessosHoje';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import KpiCard from '../components/ui/KpiCard';
import PageHeader from '../components/ui/PageHeader';
import Table from '../components/ui/Table';

function badgeAcesso(resultado) {
  const status = resultado?.toLowerCase().trim();
  const permitido = status === 'permitido' || status === 'liberado';
  return <Badge tone={permitido ? 'green' : 'red'}>{permitido ? 'Permitido' : 'Negado'}</Badge>;
}

export default function Dashboard() {
  const [alunos, setAlunos] = useState([]);
  const [acessos, setAcessos] = useState([]);
  const [erro, setErro] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      const listaAlunos = await fetchAlunos();
      setAlunos(listaAlunos);

      const todosAcessos = await fetchTodosAcessos();
      const acessosComNome = todosAcessos.map((acesso) => {
        const aluno = listaAlunos.find((a) => a.id === acesso.aluno_id);
        return { ...acesso, nome: aluno ? aluno.nome : 'Aluno desconhecido' };
      });

      setAcessos(acessosComNome.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora)));
      setErro(null);
    } catch (error) {
      setErro('Erro ao carregar dados do dashboard.');
      console.error(error);
    }
  }

  const totalAlunos = alunos.length;
  const alunosAtivos = alunos.filter((a) => a.status_ativo === 'ativo').length;
  const alunosInativos = alunos.filter((a) => a.status_ativo !== 'ativo').length;
  const ultimosAcessos = acessos.slice(0, 20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Geral"
        subtitle="Visão operacional da academia, alunos e acessos recentes."
        actions={
          <>
            <Button variant="secondary" onClick={carregarDados}>Atualizar</Button>
            <Button onClick={() => setModalAberto(true)}>Acessos do Dia</Button>
          </>
        }
      />

      {erro && <Card className="p-4 text-red-700 font-semibold">{erro}</Card>}

      <div className="ui-status-grid">
        <KpiCard
          label="Total de Alunos"
          value={totalAlunos}
          subtitle="Cadastrados no sistema"
          icon={<Users size={20} />}
          tone="blue"
          onClick={() => navigate('/alunos')}
        />
        <KpiCard
          label="Operacionais Ativos"
          value={alunosAtivos}
          subtitle="Liberados operacionalmente"
          icon={<UserCheck size={20} />}
          tone="green"
        />
        <KpiCard
          label="Operacionais Inativos"
          value={alunosInativos}
          subtitle="Exigem atenção cadastral"
          icon={<UserX size={20} />}
          tone="red"
        />
        <KpiCard
          label="Acessos Recentes"
          value={ultimosAcessos.length}
          subtitle="Últimos registros carregados"
          icon={<Activity size={20} />}
          tone="gray"
        />
      </div>

      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Últimos 20 Acessos</h2>
            <p className="ui-section-subtitle">Histórico operacional recente sem dados financeiros sensíveis.</p>
          </div>
        </div>

        {ultimosAcessos.length === 0 ? (
          <EmptyState title="Nenhum acesso encontrado." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Data/Hora</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {ultimosAcessos.map(({ id, nome, data_hora, resultado }) => (
                <tr key={`${id}-${data_hora}`}>
                  <td>{nome}</td>
                  <td>{new Date(data_hora).toLocaleString('pt-BR')}</td>
                  <td>{badgeAcesso(resultado)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modalAberto && <ModalAcessosHoje onClose={() => setModalAberto(false)} />}
    </div>
  );
}
