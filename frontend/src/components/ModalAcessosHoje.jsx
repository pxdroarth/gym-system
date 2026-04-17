import React, { useState, useEffect } from 'react';
import { fetchTodosAcessos, fetchAlunos } from '../services/Api';

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
  const acessosOrdenados = acessosFiltrados.slice().sort((a, b) => (ordenAsc ? new Date(a.data_hora) - new Date(b.data_hora) : new Date(b.data_hora) - new Date(a.data_hora)));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-start pt-20 z-50">
      <div className="bg-white rounded shadow-lg max-w-4xl w-full max-h-[80vh] overflow-auto p-6 relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-gray-600 hover:text-gray-900 font-bold text-xl" aria-label="Fechar modal">&times;</button>

        <h2 className="text-2xl mb-4 font-bold">Acessos do Dia</h2>

        <div className="flex flex-col sm:flex-row items-start sm:items-center mb-4 gap-4">
          <button onClick={() => setOrdenAsc(!ordenAsc)} className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            Ordenar por Data/Hora {ordenAsc ? '↑ Crescente' : '↓ Decrescente'}
          </button>

          <input
            type="text"
            placeholder="Filtrar por nome"
            value={filtroNome}
            onChange={(e) => setFiltroNome(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1 focus:outline-none focus:ring focus:ring-indigo-300 flex-grow"
          />
        </div>

        {loading ? (
          <p>Carregando acessos...</p>
        ) : acessosOrdenados.length === 0 ? (
          <p>Nenhum acesso encontrado para o dia de hoje.</p>
        ) : (
          <table className="min-w-full text-left border">
            <thead className="bg-gray-200">
              <tr>
                <th className="p-3 border">Aluno</th>
                <th className="p-3 border">Data/Hora</th>
                <th className="p-3 border">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {acessosOrdenados.map(({ id, nome, data_hora, resultado }) => {
                const status = resultado?.toLowerCase();
                const permitido = status === 'permitido';
                return (
                  <tr key={id} className="border-t hover:bg-gray-50">
                    <td className="p-3 border">{nome}</td>
                    <td className="p-3 border">{new Date(data_hora).toLocaleString('pt-BR')}</td>
                    <td className={`p-3 border font-semibold ${permitido ? 'text-green-600' : 'text-red-600'}`}>
                      {permitido ? '✅ Permitido' : '❌ Negado'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
