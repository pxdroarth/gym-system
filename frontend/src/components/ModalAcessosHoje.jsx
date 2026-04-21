import React, { useEffect, useState } from 'react';
import { fetchAlunos, fetchTodosAcessos } from '../services/Api';
import Badge from './ui/Badge';
import Button from './ui/Button';
import EmptyState from './ui/EmptyState';
import Input from './ui/Input';
import Modal from './ui/Modal';
import Table from './ui/Table';

function badgeAcesso(resultado) {
  const status = resultado?.toLowerCase();
  const permitido = status === 'permitido' || status === 'liberado';
  return <Badge tone={permitido ? 'green' : 'red'}>{permitido ? 'Permitido' : 'Negado'}</Badge>;
}

export default function ModalAcessosHoje({ onClose }) {
  const [acessos, setAcessos] = useState([]);
  const [ordenAsc, setOrdenAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filtroNome, setFiltroNome] = useState('');

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      try {
        const [todosAcessos, listaAlunos] = await Promise.all([fetchTodosAcessos(), fetchAlunos()]);

        const hoje = new Date();
        const acessosHoje = todosAcessos.filter((acesso) => {
          const dataAcesso = new Date(acesso.data_hora);
          return (
            dataAcesso.getDate() === hoje.getDate() &&
            dataAcesso.getMonth() === hoje.getMonth() &&
            dataAcesso.getFullYear() === hoje.getFullYear()
          );
        });

        const acessosComNome = acessosHoje.map((acesso) => {
          const aluno = listaAlunos.find((a) => a.id === acesso.aluno_id);
          return { ...acesso, nome: aluno ? aluno.nome : 'Aluno desconhecido' };
        });

        setAcessos(acessosComNome);
      } catch (error) {
        console.error('Erro ao carregar acessos do dia:', error);
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const acessosFiltrados = acessos.filter((acesso) => acesso.nome.toLowerCase().includes(filtroNome.toLowerCase()));
  const acessosOrdenados = acessosFiltrados.slice().sort((a, b) => (
    ordenAsc
      ? new Date(a.data_hora) - new Date(b.data_hora)
      : new Date(b.data_hora) - new Date(a.data_hora)
  ));

  return (
    <Modal
      title="Acessos do Dia"
      onClose={onClose}
      className="max-w-4xl"
      footer={
        <div className="flex justify-between items-center w-full gap-3">
          <span className="text-sm text-gray-500">{acessosOrdenados.length} acesso(s) encontrado(s)</span>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center mb-4 gap-3">
        <Button variant="secondary" onClick={() => setOrdenAsc(!ordenAsc)}>
          Ordenar {ordenAsc ? 'crescente' : 'decrescente'}
        </Button>

        <div className="flex-1 w-full">
          <Input
            type="text"
            placeholder="Filtrar por nome"
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <EmptyState title="Carregando acessos..." />
      ) : acessosOrdenados.length === 0 ? (
        <EmptyState title="Nenhum acesso encontrado para hoje." />
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
            {acessosOrdenados.map(({ id, nome, data_hora, resultado }) => (
              <tr key={id}>
                <td>{nome}</td>
                <td>{new Date(data_hora).toLocaleString('pt-BR')}</td>
                <td>{badgeAcesso(resultado)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
