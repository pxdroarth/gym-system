import React, { useEffect, useMemo, useState } from "react";
import { Banknote, CalendarDays, CircleDollarSign, TrendingDown, TrendingUp, Users } from "lucide-react";
import { getDashboardKPIs } from "../../services/dashboardService";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import KpiCard from "../../components/ui/KpiCard";
import PillButton from "../../components/ui/PillButton";
import getApiErrorMessage from "../../utils/getApiErrorMessage";

export default function FinanceiroDashboard() {
  const [dados, setDados] = useState(null);
  const [periodo, setPeriodo] = useState("mensal");
  const [intervaloDatas, setIntervaloDatas] = useState({ inicio: "", fim: "" });
  const [erro, setErro] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (periodo !== "personalizado" || (intervaloDatas.inicio && intervaloDatas.fim)) {
      carregarKPIs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, intervaloDatas]);

  const carregarKPIs = async () => {
    try {
      setLoading(true);
      const filtros = { periodo };
      if (periodo === "personalizado" && intervaloDatas.inicio && intervaloDatas.fim) {
        filtros.data_inicio = intervaloDatas.inicio;
        filtros.data_fim = intervaloDatas.fim;
      }
      const data = await getDashboardKPIs(filtros);
      setDados(data);
      setErro(false);
    } catch (error) {
      console.error("Erro ao carregar dashboard financeiro.");
      setErro(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const periodos = [
    { key: "diario", label: "Diário" },
    { key: "semanal", label: "Semanal" },
    { key: "mensal", label: "Mensal" },
    { key: "trimestre", label: "Trimestre" },
    { key: "semestre", label: "Semestre" },
    { key: "anual", label: "Anual" },
    { key: "personalizado", label: "Personalizado" },
  ];

  const formatarValor = (valor) =>
    Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cardsResumo = useMemo(() => {
    if (!dados) return [];
    return [
      {
        id: "saldo",
        label: "Saldo atual",
        value: formatarValor(dados.saldo_atual),
        copy: "Posição financeira atual dentro do recorte selecionado.",
      },
      {
        id: "lucro",
        label: "Lucro real",
        value: formatarValor(dados.lucro_real),
        copy: "Leitura consolidada do resultado real do período.",
      },
      {
        id: "pendencias",
        label: "Pressão de caixa",
        value: formatarValor((dados.a_receber || 0) - (dados.despesas_a_pagar || 0)),
        copy: "Diferença entre valores ainda a receber e contas em aberto.",
      },
    ];
  }, [dados]);

  return (
    <div className="space-y-6">
      <Card className="finance-filter-card">
        <div className="entity-toolbar">
          <div className="entity-toolbar__intro">
            <span className="entity-toolbar__eyebrow">Leitura financeira</span>
            <div>
              <h2 className="ui-section-title">Dashboard financeiro</h2>
              <p className="ui-section-subtitle">Indicadores monetários restritos conforme o período selecionado.</p>
            </div>
          </div>
        </div>

        <div className="finance-filter-bar">
          <div className="finance-filter-bar__group">
            {periodos.map((item) => (
              <PillButton
                key={item.key}
                active={periodo === item.key}
                onClick={() => {
                  setPeriodo(item.key);
                  setIntervaloDatas({ inicio: "", fim: "" });
                }}
              >
                {item.label}
              </PillButton>
            ))}
          </div>

          {periodo === "personalizado" && (
            <div className="finance-filter-bar__group">
              <Input
                label="Data Inicial"
                type="date"
                value={intervaloDatas.inicio}
                onChange={(event) => setIntervaloDatas((estado) => ({ ...estado, inicio: event.target.value }))}
                className="max-w-44"
              />
              <Input
                label="Data Final"
                type="date"
                value={intervaloDatas.fim}
                onChange={(event) => setIntervaloDatas((estado) => ({ ...estado, fim: event.target.value }))}
                className="max-w-44"
              />
              <Button onClick={carregarKPIs} disabled={!intervaloDatas.inicio || !intervaloDatas.fim}>
                Filtrar
              </Button>
            </div>
          )}
        </div>
      </Card>

      {erro && <Card className="p-4 text-red-700 font-semibold">{erro}</Card>}
      {loading && <EmptyState title="Carregando dashboard financeiro..." />}

      {dados && !loading && (
        <>
          <div className="ui-status-grid">
            <KpiCard label="Receita real total" value={formatarValor(dados.receita_real_total)} icon={<TrendingUp size={20} />} tone="green" />
            <KpiCard label="Lucro real" value={formatarValor(dados.lucro_real)} icon={<CircleDollarSign size={20} />} tone="green" />
            <KpiCard label="Saldo atual" value={formatarValor(dados.saldo_atual)} icon={<Banknote size={20} />} tone="blue" />
            <KpiCard label="Despesas pagas" value={formatarValor(dados.despesas_pagas)} icon={<TrendingDown size={20} />} tone="red" />
          </div>

          <div className="finance-grid">
            <Card className="finance-panel">
              <div className="entity-toolbar">
                <div className="entity-toolbar__intro">
                  <span className="entity-toolbar__eyebrow">Fluxo de caixa</span>
                  <div>
                    <h2 className="ui-section-title">Resumo do período</h2>
                    <p className="ui-section-subtitle">Peso visual maior para os indicadores monetários críticos desta unidade.</p>
                  </div>
                </div>
              </div>
              <div className="finance-panel__body">
                <div className="ui-status-grid">
                  <KpiCard label="Mensalidades recebidas" value={formatarValor(dados.mensalidades_recebidas)} icon={<CalendarDays size={20} />} tone="green" />
                  <KpiCard label="Vendas recebidas" value={formatarValor(dados.vendas_recebidas)} icon={<CircleDollarSign size={20} />} tone="blue" />
                  <KpiCard label="Receitas a receber" value={formatarValor(dados.a_receber)} icon={<Banknote size={20} />} tone="amber" />
                  <KpiCard label="Despesas a pagar" value={formatarValor(dados.despesas_a_pagar)} icon={<TrendingDown size={20} />} tone="amber" />
                </div>
              </div>
            </Card>

            <Card className="finance-panel">
              <div className="entity-toolbar">
                <div className="entity-toolbar__intro">
                  <span className="entity-toolbar__eyebrow">Governança</span>
                  <div>
                    <h2 className="ui-section-title">Leitura rápida</h2>
                    <p className="ui-section-subtitle">Apoio visual sem alterar os cálculos nem a fonte de verdade.</p>
                  </div>
                </div>
              </div>
              <div className="finance-panel__body">
                <div className="finance-list">
                  {cardsResumo.map((card) => (
                    <div key={card.id} className="finance-glass-card">
                      <div className="finance-glass-card__label">{card.label}</div>
                      <div className="finance-glass-card__value">{card.value}</div>
                      <div className="finance-glass-card__copy">{card.copy}</div>
                    </div>
                  ))}
                  <div className="finance-list__item">
                    <div>
                      <div className="finance-list__title">Clientes pendentes</div>
                      <div className="finance-list__copy">Quantidade de alunos ainda com pressão financeira no período.</div>
                    </div>
                    <div className="finance-list__value">{dados.clientes_pendentes ?? 0}</div>
                  </div>
                  <div className="finance-list__item">
                    <div>
                      <div className="finance-list__title">Variação de receita</div>
                      <div className="finance-list__copy">Indicador percentual retornado pelo endpoint atual.</div>
                    </div>
                    <div className="finance-list__value">{`${Number(dados.variacao_mensal || 0).toFixed(2)}%`}</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
