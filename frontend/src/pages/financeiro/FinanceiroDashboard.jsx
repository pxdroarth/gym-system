import { Link } from "react-router-dom";
import Table from "../../components/ui/Table";
import Badge from "../../components/ui/Badge";
import { getContasFinanceiras } from "../../services/contasFinanceiras";
import { useEffect, useState } from "react";
import { Banknote, CalendarDays, CircleDollarSign, TrendingDown, TrendingUp, Users } from "lucide-react";
import { getDashboardKPIs } from "../../services/dashboardService";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import KpiCard from "../../components/ui/KpiCard";
import MovementChart from "../../components/ui/MovementChart";
import PageHeader from "../../components/ui/PageHeader";
import PillButton from "../../components/ui/PillButton";
import useAuth from "../../hooks/useAuth";
import getApiErrorMessage from "../../utils/getApiErrorMessage";

const periods = [
  ["diario", "Diário"], ["semanal", "Semanal"], ["mensal", "Mensal"],
  ["trimestre", "Trimestre"], ["semestre", "Semestre"], ["anual", "Anual"],
  ["personalizado", "Personalizado"],
];

const money = (value) => Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const display = (iso) => iso.split("-").reverse().join("/");
const addDays = (iso, days) => {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Each bucket uses the same scoped KPI endpoint and accounting rules as the totals.
function buckets(start, end) {
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  const size = Math.max(1, Math.ceil(days / 10));
  const result = [];
  for (let from = start; from <= end; from = addDays(from, size)) {
    const until = addDays(from, size - 1);
    result.push({ start: from, end: until < end ? until : end });
  }
  return result;
}

export default function FinanceiroDashboard() {
  const { currentUnit } = useAuth();
  const [selection, setSelection] = useState({ periodo: "mensal" });
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState({ inicio: "", fim: "" });
  const [data, setData] = useState(null);
  const [series, setSeries] = useState(null);
  const [error, setError] = useState("");
  const [chartError, setChartError] = useState("");
  const [accounts, setAccounts] = useState(null);
  const [accountsError, setAccountsError] = useState("");

  useEffect(() => {
    let active = true;
    setData(null);
    setSeries(null);
    setError("");
    setChartError("");
    setAccounts(null);
    setAccountsError("");
    async function load() {
      let totals;
      try {
        totals = await getDashboardKPIs(selection);
        if (!active) return;
        setData(totals);
      } catch (failure) {
        if (active) setError(getApiErrorMessage(failure));
        return;
      }
      const { data_inicio: start, data_fim: end } = totals.periodo_aplicado;
      const intervals = buckets(start, end);
      getContasFinanceiras({ perPage: 7, data_inicial: start, data_final: end })
        .then((result) => { if (active) setAccounts(result.data); })
        .catch((failure) => { if (active) setAccountsError(getApiErrorMessage(failure)); });
      try {
        const results = intervals.length === 1 ? [totals] : await Promise.all(intervals.map((bucket) =>
          getDashboardKPIs({ periodo: "personalizado", data_inicio: bucket.start, data_fim: bucket.end })));
        if (!active) return;
        let cumulative = 0;
        setSeries(results.map((result, i) => {
          const bucket = intervals[i];
          cumulative += Number(result.lucro_real ?? 0);
          return {
            label: display(bucket.start).slice(0, 5),
            fullLabel: bucket.start === bucket.end ? display(bucket.start) : `${display(bucket.start)} a ${display(bucket.end)}`,
            entries: result.receita_real_total,
            expenses: -result.despesas_pagas,
            balance: cumulative,
          };
        }));
      } catch (failure) {
        if (active) setChartError(getApiErrorMessage(failure));
      }
    }
    load();
    return () => { active = false; };
  }, [selection]);

  function choose(periodo) {
    setCustom(periodo === "personalizado");
    if (periodo !== "personalizado") setSelection({ periodo });
  }

  const range = data?.periodo_aplicado;
  const context = range && (range.data_inicio === range.data_fim ? display(range.data_inicio) :
    `${display(range.data_inicio)} a ${display(range.data_fim)}`);
  const cards = data && [
    ["Receita real total", data.receita_real_total, TrendingUp, "green"],
    ["Despesas pagas", data.despesas_pagas, TrendingDown, "red"],
    ["Saldo do período", data.saldo_atual, Banknote, "blue"],
    ["Receitas a receber", data.a_receber, CircleDollarSign, "amber"],
  ];

  return <div className="gym-module">
    <PageHeader title="Dashboard Financeiro" subtitle={currentUnit?.nome} />
    <Card className="gym-panel finance-period">
      <div className="gym-filters" role="group" aria-label="Período">
        {periods.map(([key, label]) => <PillButton key={key} active={custom ? key === "personalizado" : key === selection.periodo}
          onClick={() => choose(key)}>{label}</PillButton>)}
        {context && <span className="gym-period-context"><CalendarDays size={16} /> {context}</span>}
      </div>
      {custom && <form className="gym-filters mt-4" onSubmit={(event) => {
        event.preventDefault();
        setSelection({ periodo: "personalizado", data_inicio: draft.inicio, data_fim: draft.fim });
      }}>
        <Input label="Data inicial" type="date" required value={draft.inicio} onChange={(e) => setDraft({ ...draft, inicio: e.target.value })} />
        <Input label="Data final" type="date" min={draft.inicio || undefined} required value={draft.fim} onChange={(e) => setDraft({ ...draft, fim: e.target.value })} />
        <Button type="submit" disabled={!draft.inicio || !draft.fim || draft.inicio > draft.fim}>Aplicar período</Button>
      </form>}
    </Card>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Carregando indicadores…</p>}
    {data && <>
      <div className="ui-status-grid" aria-label="Indicadores financeiros">
        {cards.map(([label, value, Icon, tone]) => <KpiCard key={label} label={label} value={money(value)} tone={tone}
          icon={<Icon size={24} />} subtitle={context} />)}
      </div>
      <div className="gym-finance-grid">
        <Card className="gym-panel">
          <div className="gym-panel__head"><div><h2 className="ui-section-title">Fluxo de caixa</h2><p>{currentUnit?.nome} · {context}</p></div></div>
          {chartError ? <p role="alert">{chartError}</p> : series ?
            <MovementChart title="Fluxo de caixa do período" data={series} format={money}
              bars={[{ key: "entries", label: "Entradas" }, { key: "expenses", label: "Saídas" }]}
              line={{ key: "balance", label: "Saldo acumulado no recorte" }} /> : <p role="status">Carregando gráfico…</p>}
        </Card>
        <Card className="gym-panel">
          <div className="gym-panel__head"><div><h2 className="ui-section-title">Contas manuais recentes</h2><p>{context}</p></div>
            <Link to="/financeiro/contas-financeiras">Ver contas →</Link></div>
          {accountsError ? <p role="alert">{accountsError}</p> : !accounts ? <p role="status">Carregando contas…</p> :
            <Table aria-label="Contas manuais recentes"><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Status</th></tr></thead>
              <tbody>{accounts.length ? accounts.map((account) => <tr key={account.id}>
                <td>{display(account.data_lancamento.slice(0, 10))}</td><td>{account.descricao}</td>
                <td>{money(account.tipo === "despesa" ? -account.valor : account.valor)}</td>
                <td><Badge tone={account.status === "pago" ? "green" : "amber"}>{account.status === "pago" ? "Pago" : "Pendente"}</Badge></td>
              </tr>) : <tr><td colSpan={4}>Nenhuma conta manual no recorte.</td></tr>}</tbody>
            </Table>}
        </Card>
      </div>
      <Card className="gym-panel">
          <div className="gym-panel__head"><div><h2 className="ui-section-title">Resumo do período</h2><p>{context}</p></div></div>
          <dl className="gym-ledger">
            <div><dt>Mensalidades recebidas</dt><dd>{money(data.mensalidades_recebidas)}</dd></div>
            <div><dt>Vendas recebidas</dt><dd>{money(data.vendas_recebidas)}</dd></div>
            <div><dt>Receitas avulsas</dt><dd>{money(data.receitas_avulsas)}</dd></div>
            <div><dt>Lucro real</dt><dd>{money(data.lucro_real)}</dd></div>
            <div><dt>Despesas a pagar</dt><dd>{money(data.despesas_a_pagar)}</dd></div>
            <div><dt>Pressão de caixa</dt><dd>{money(Number(data.a_receber) - Number(data.despesas_a_pagar))}</dd></div>
            <div><dt><Users size={15} /> Clientes pendentes</dt><dd>{data.clientes_pendentes}</dd></div>
          </dl>
      </Card>
    </>}
  </div>;
}
