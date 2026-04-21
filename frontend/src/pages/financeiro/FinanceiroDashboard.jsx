import React, { useEffect, useState } from 'react';
import { Banknote, CalendarDays, CircleDollarSign, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { getDashboardKPIs } from '../../services/dashboardService';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import KpiCard from '../../components/ui/KpiCard';
import PillButton from '../../components/ui/PillButton';

export default function FinanceiroDashboard() {
  const [dados, setDados] = useState(null);
  const [periodo, setPeriodo] = useState('mensal');
  const [intervaloDatas, setIntervaloDatas] = useState({ inicio: '', fim: '' });
  const [erro, setErro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (periodo !== 'personalizado' || (intervaloDatas.inicio && intervaloDatas.fim)) {
      carregarKPIs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, intervaloDatas]);

  const carregarKPIs = async () => {
    try {
      setLoading(true);
      const filtros = { periodo };
      if (periodo === 'personalizado' && intervaloDatas.inicio && intervaloDatas.fim) {
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
    { key: 'personalizado', label: 'Personalizado' },
  ];

  const formatarValor = (valor) =>
    Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="space-y-6">
      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Dashboard Financeiro</h2>
            <p className="ui-section-subtitle">Indicadores financeiros restritos conforme o período selecionado.</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            {periodos.map((p) => (
              <PillButton
                key={p.key}
                active={periodo === p.key}
                onClick={() => {
                  setPeriodo(p.key);
                  setIntervaloDatas({ inicio: '', fim: '' });
                }}
              >
                {p.label}
              </PillButton>
            ))}
          </div>

          {periodo === 'personalizado' && (
            <div className="flex items-end gap-3 flex-wrap">
              <Input
                label="Data Inicial"
                type="date"
                value={intervaloDatas.inicio}
                onChange={(e) => setIntervaloDatas((d) => ({ ...d, inicio: e.target.value }))}
                className="max-w-44"
              />
              <Input
                label="Data Final"
                type="date"
                value={intervaloDatas.fim}
                onChange={(e) => setIntervaloDatas((d) => ({ ...d, fim: e.target.value }))}
                className="max-w-44"
              />
              <Button onClick={carregarKPIs} disabled={!intervaloDatas.inicio || !intervaloDatas.fim}>
                Filtrar
              </Button>
            </div>
          )}
        </div>
      </Card>

      {erro && <Card className="p-4 text-red-700 font-semibold">Falha ao carregar dashboard financeiro.</Card>}
      {loading && <EmptyState title="Carregando dashboard financeiro..." />}

      {dados && !loading && (
        <>
          <div className="ui-status-grid">
            <KpiCard label="Receita Real Total" value={formatarValor(dados.receita_real_total)} icon={<TrendingUp size={20} />} tone="green" />
            <KpiCard label="Lucro Real" value={formatarValor(dados.lucro_real)} icon={<CircleDollarSign size={20} />} tone="green" />
            <KpiCard label="Saldo Atual" value={formatarValor(dados.saldo_atual)} icon={<Banknote size={20} />} tone="blue" />
            <KpiCard label="Despesas Pagas" value={formatarValor(dados.despesas_pagas)} icon={<TrendingDown size={20} />} tone="red" />
          </div>

          <div className="ui-status-grid">
            <KpiCard label="Mensalidades Recebidas" value={formatarValor(dados.mensalidades_recebidas)} icon={<CalendarDays size={20} />} tone="green" />
            <KpiCard label="Vendas Recebidas" value={formatarValor(dados.vendas_recebidas)} icon={<CircleDollarSign size={20} />} tone="blue" />
            <KpiCard label="Receitas a Receber" value={formatarValor(dados.a_receber)} icon={<Banknote size={20} />} tone="amber" />
            <KpiCard label="Despesas a Pagar" value={formatarValor(dados.despesas_a_pagar)} icon={<TrendingDown size={20} />} tone="amber" />
          </div>

          <div className="ui-status-grid">
            <KpiCard label="Clientes Pendentes" value={dados.clientes_pendentes ?? 0} icon={<Users size={20} />} tone="gray" />
            <KpiCard label="Variação Receita Mensal" value={`${Number(dados.variacao_mensal || 0).toFixed(2)}%`} icon={<TrendingUp size={20} />} tone="gray" />
          </div>
        </>
      )}
    </div>
  );
}
