import { useEffect, useState } from "react";
import { CalendarDays, Radio, RefreshCw, ShieldCheck, UserCheck, Users, UserX } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchAlunos } from "../services/alunoService";
import { fetchTodosAcessos } from "../services/acessoService";
import AccessHistory, { accessHour, accessInstant, allowedAccess, operationalDay, StudentIdentity } from "../components/AccessHistory";
import ModalAcessosHoje from "../components/ModalAcessosHoje";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import KpiCard from "../components/ui/KpiCard";
import MovementChart from "../components/ui/MovementChart";
import PageHeader from "../components/ui/PageHeader";
import useAuth from "../hooks/useAuth";
import { UI_PERMISSIONS, userHasUiPermission } from "../utils/permissions";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";

const covered = (student) => [true, 1].includes(student.cobertura_paga_vigente)
  || student.cobertura_status === "cobertura_paga_vigente";

export default function Dashboard() {
  const { currentUnit, user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [dayModal, setDayModal] = useState(false);
  const today = operationalDay();
  const dateLabel = today.split("-").reverse().join("/");
  const canListStudents = userHasUiPermission(user, UI_PERMISSIONS.NAV_ALUNOS);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([fetchAlunos(), fetchTodosAcessos()]).then(([students, access]) => {
      if (active) setData({ students, access });
    }).catch((failure) => { if (active) setError(getApiErrorMessage(failure)); });
    return () => { active = false; };
  }, [refresh]);

  const students = data?.students ?? [];
  const access = data?.access ?? [];
  const byId = new Map(students.map((row) => [row.id, row]));
  const withoutCoverage = students.filter((row) => !covered(row));
  const withCoverage = students.length - withoutCoverage.length;
  const percent = students.length ? Math.round(withCoverage / students.length * 100) : 0;
  const todayRows = access.filter((row) => operationalDay(accessInstant(row.data_hora)) === today);
  const chart = new Map();
  for (const row of todayRows) {
    const label = accessHour(accessInstant(row.data_hora));
    const bucket = chart.get(label) ?? { label, allowed: 0, denied: 0 };
    bucket[allowedAccess(row) ? "allowed" : "denied"] += 1;
    chart.set(label, bucket);
  }

  return <div className="gym-dashboard">
    <PageHeader title="Dashboard Geral" subtitle={`${currentUnit?.nome || "Unidade"} · ${dateLabel}`} actions={<>
      <Button variant="ghost" aria-label="Atualizar dados" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={17} /></Button>
      <Button onClick={() => setDayModal(true)}><CalendarDays size={16} /> Acessos do Dia</Button>
    </>} />
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Carregando indicadores…</p>}
    {data && <>
      <div className="ui-status-grid">
        <KpiCard label="Total de alunos" value={students.length} subtitle="Cadastro atual" icon={<Users size={28} />} onClick={canListStudents ? () => navigate("/alunos") : undefined} />
        <KpiCard label="Com cobertura paga" value={withCoverage} subtitle="Vigente hoje" tone="green" icon={<UserCheck size={28} />} />
        <KpiCard label="Sem cobertura paga" value={withoutCoverage.length} subtitle="Situação atual" tone="amber" icon={<UserX size={28} />} />
        <KpiCard label="Acessos hoje" value={todayRows.length} subtitle={dateLabel} icon={<Radio size={28} />} onClick={() => setDayModal(true)} />
      </div>
      <Card className="gym-panel">
        <div className="gym-panel__head"><h2 className="ui-section-title">Últimos acessos</h2><Link to="/acessos">Ver todos os acessos →</Link></div>
        <AccessHistory rows={access.slice(0, 6)} students={byId} unit={currentUnit} />
      </Card>
      <div className="gym-columns">
        <Card className="gym-panel">
          <div className="gym-panel__head"><div><h2 className="ui-section-title inline-flex items-center gap-2"><ShieldCheck size={19} /> Cobertura paga</h2><p>Vigência em {dateLabel} · {currentUnit?.nome}</p></div></div>
          <p className="gym-coverage-value">{withCoverage} <small>de {students.length} alunos</small> · {percent}%</p>
          <progress className="gym-coverage" max={100} value={percent} aria-label="Percentual de alunos com cobertura paga" />
        </Card>
        <Card className="gym-panel">
          <div className="gym-panel__head"><div><h2 className="ui-section-title">Sem cobertura paga</h2><p>A falta de cobertura não gera dívida automática.</p></div>{canListStudents && <Link to="/alunos?cobertura=sem">Ver lista →</Link>}</div>
          <ul className="space-y-3">{withoutCoverage.slice(0, 3).map((row) => <li key={row.id}><StudentIdentity student={row} /></li>)}</ul>
          {!withoutCoverage.length && <p>Todos os alunos têm cobertura paga.</p>}
        </Card>
      </div>
      <Card className="gym-panel">
        <div className="gym-panel__head"><div><h2 className="ui-section-title">Movimento de acessos</h2><p>{dateLabel} · {currentUnit?.nome} · Registros por hora</p></div></div>
        <MovementChart title="Movimento de acessos por hora" data={[...chart.values()].sort((a, b) => a.label.localeCompare(b.label))}
          bars={[{ key: "allowed", label: "Permitidos" }, { key: "denied", label: "Negados" }]} />
      </Card>
    </>}
    {dayModal && <ModalAcessosHoje onClose={() => setDayModal(false)} />}
  </div>;
}
