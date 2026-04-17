import React, { useEffect, useState } from 'react';
import { getDashboardKPIs } from '../../services/dashboardService';

export default function FinanceiroDashboard() {
  const [dados, setDados] = useState(null);
  const [periodo, setPeriodo] = useState('mensal');
  const [intervaloDatas, setIntervaloDatas] = useState({ inicio: '', fim: '' });
  const [erro, setErro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (periodo !== 'intervalo_datas' || (intervaloDatas.inicio && intervaloDatas.fim)) {
      carregarKPIs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, intervaloDatas]);

  const carregarKPIs = async () => {
    try {
      setLoading(true);
      const filtros = { periodo };
      if (periodo === 'intervalo_datas' && intervaloDatas.inicio && intervaloDatas.fim) {
        filtros.data_inicio = intervaloDatas.inicio;
        filtros.data_fim = intervaloDatas.fim;
      }
      const data = await getDashboardKPIs(filtros);
      setDados(data);
      setErro(false);
    } catch (error) {
      console.error('Erro ao carregar dashboard financeiro:', error);
      setErro(true);
    } finally {
      setLoading(false);
    }
  };

  const periodos = [
    { key: 'diario', label: 'Diário' },
    { key: 'semanal', label: 'Semanal' },
    { key: 'mensal', label: 'Mensal' },
    { key: 'trimestre', label: 'Trimestre' },
    { key: 'semestre', label: 'Semestre' },
    { key: 'anual', label: 'Anual' },
    { key: 'intervalo_datas', label: 'Intervalo de Datas' },
  ];

  const formatarValor = (valor) =>
    Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Dashboard Financeiro</h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {periodos.map((p) => (
          <button
            key={p.key}
            className={`px-4 py-2 rounded ${
              periodo === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100'
            }`}
            onClick={() => {
              setPeriodo(p.key);
              setIntervaloDatas({ inicio: '', fim: '' });
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {periodo === 'intervalo_datas' && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <label>
            Data Inicial:
            <input
              type="date"
              className="ml-2 px-2 py-1 border rounded"
              value={intervaloDatas.inicio}
              onChange={(e) => setIntervaloDatas((d) => ({ ...d, inicio: e.target.value }))}
            />
          </label>
          <label>
            Data Final:
            <input
              type="date"
              className="ml-2 px-2 py-1 border rounded"
              value={intervaloDatas.fim}
              onChange={(e) => setIntervaloDatas((d) => ({ ...d, fim: e.target.value }))}
            />
          </label>
          <button
            className="ml-4 bg-blue-600 text-white px-3 py-1 rounded"
            onClick={carregarKPIs}
            disabled={!intervaloDatas.inicio || !intervaloDatas.fim}
          >
            Filtrar
          </button>
        </div>
      )}

      {erro && <div className="text-red-600 font-semibold mb-4">Falha ao carregar dashboard.</div>}
      {loading && <div className="text-gray-500 mb-4">Carregando dashboard...</div>}

      {dados && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <Card titulo="Mensalidades Recebidas" valor={formatarValor(dados.mensalidades_recebidas)} cor="text-green-700" />
          <Card titulo="Vendas Recebidas" valor={formatarValor(dados.vendas_recebidas)} cor="text-blue-600" />
          <Card titulo="Receita Real Total" valor={formatarValor(dados.receita_real_total)} cor="text-green-700" />
          <Card titulo="Despesas Pagas" valor={formatarValor(dados.despesas_pagas)} cor="text-red-600" />
          <Card titulo="Lucro Real" valor={formatarValor(dados.lucro_real)} cor="text-green-700" />
          <Card titulo="Saldo Atual" valor={formatarValor(dados.saldo_atual)} />
          <Card titulo="Receitas a Receber" valor={formatarValor(dados.a_receber)} />
          <Card titulo="Despesas a Pagar" valor={formatarValor(dados.despesas_a_pagar)} />
          <Card titulo="Clientes Pendentes" valor={dados.clientes_pendentes ?? 0} />
          <Card titulo="Variação Receita Mensal" valor={`${Number(dados.variacao_mensal || 0).toFixed(2)}%`} />
        </div>
      )}
    </div>
  );
}

function Card({ titulo, valor, cor }) {
  return (
    <div className="bg-white p-4 rounded shadow text-center">
      <div className="text-gray-500">{titulo}</div>
      <div className={`text-lg font-bold ${cor ?? 'text-black'}`}>{valor}</div>
    </div>
  );
}
