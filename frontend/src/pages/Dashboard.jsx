import React, { useEffect, useState } from 'react';
import { fetchAlunos, fetchTodosAcessos } from '../services/Api';
import ModalAcessosHoje from '../components/ModalAcessosHoje';
import { useNavigate } from 'react-router-dom';

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
    <div className="pt-16 max-w-5xl mx-auto p-6 bg-white rounded shadow space-y-8">
      <h2 className="text-2xl font-bold text-blue-700">Dashboard Geral</h2>
      {erro && <p className="text-red-600">{erro}</p>}

      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 flex-grow">
          <div className="bg-blue-100 text-blue-900 p-4 rounded shadow text-center cursor-pointer" onClick={() => navigate('/alunos')}>
            <p className="text-sm">Total de Alunos</p>
            <p className="text-xl font-bold">{totalAlunos}</p>
          </div>
          <div className="bg-green-100 text-green-900 p-4 rounded shadow text-center">
            <p className="text-sm">Status Operacional Ativo</p>
            <p className="text-xl font-bold">{alunosAtivos}</p>
          </div>
          <div className="bg-red-100 text-red-900 p-4 rounded shadow text-center">
            <p className="text-sm">Status Operacional Inativo</p>
            <p className="text-xl font-bold">{alunosInativos}</p>
          </div>
        </div>

        <button onClick={() => setModalAberto(true)} className="ml-4 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition">
          Mostrar todos acessos
        </button>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">Últimos 20 Acessos</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left border">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-3 border">Aluno</th>
                <th className="p-3 border">Data/Hora</th>
                <th className="p-3 border">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {ultimosAcessos.length === 0 ? (
                <tr><td colSpan={3} className="p-3 text-center">Nenhum acesso encontrado.</td></tr>
              ) : (
                ultimosAcessos.map(({ id, nome, data_hora, resultado }) => {
                  const status = resultado?.toLowerCase().trim();
                  const permitido = status === 'permitido';
                  return (
                    <tr key={`${id}-${data_hora}`} className="border-t hover:bg-gray-50">
                      <td className="p-3 border">{nome}</td>
                      <td className="p-3 border">{new Date(data_hora).toLocaleString('pt-BR')}</td>
                      <td className={`p-3 border font-semibold ${permitido ? 'text-green-600' : 'text-red-600'}`}>
                        {permitido ? '✅ Permitido' : '❌ Negado'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalAberto && <ModalAcessosHoje onClose={() => setModalAberto(false)} />}
    </div>
  );
}
