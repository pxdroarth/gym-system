import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CircleCheck, CircleX, Clock, Plus, Radio } from "lucide-react";
import { toast } from "react-toastify";
import { useSearchParams } from "react-router-dom";
import AccessHistory, { accessHour, accessInstant, allowedAccess, operationalDay } from "../components/AccessHistory";
import ModalAcessosHoje from "../components/ModalAcessosHoje";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import KpiCard from "../components/ui/KpiCard";
import Modal from "../components/ui/Modal";
import PageHeader from "../components/ui/PageHeader";
import Pagination from "../components/ui/Pagination";
import Select from "../components/ui/Select";
import useAuth from "../hooks/useAuth";
import { fetchAlunos } from "../services/alunoService";
import { fetchTodosAcessos, registrarAcesso } from "../services/acessoService";
import getApiErrorMessage from "../utils/getApiErrorMessage";

export default function AcessosPage() {
  const { currentUnit } = useAuth();
  const [params, setParams] = useSearchParams();
  const [students, setStudents] = useState([]);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState("");
  const date = params.get("data") || "";
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState("");
  const [student, setStudent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const byId = useMemo(() => new Map(students.map((item) => [item.id, item])), [students]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAlunos(), fetchTodosAcessos()]).then(([students, rows]) => {
      if (!active) return;
      setStudents(students);
      setHistory(rows);
    }).catch((failure) => { if (active) setError(getApiErrorMessage(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const term = query.trim().toLocaleLowerCase("pt-BR");
  const filtered = history.filter((row) => {
    const person = byId.get(row.aluno_id);
    return (!date || operationalDay(accessInstant(row.data_hora)) === date)
      && (!status || allowedAccess(row) === (status === "permitido"))
      && [person?.nome || row.aluno_nome, person?.matricula].some((value) =>
        String(value ?? "").toLocaleLowerCase("pt-BR").includes(term));
  });
  const allowed = filtered.filter(allowedAccess).length;
  const hours = new Map();
  for (const row of filtered) {
    const hour = accessHour(accessInstant(row.data_hora));
    if (hour) hours.set(hour, (hours.get(hour) ?? 0) + 1);
  }
  const peak = [...hours].sort(([aHour, aCount], [bHour, bCount]) => bCount - aCount || aHour.localeCompare(bHour))[0];
  const context = date ? date.split("-").reverse().join("/") : "Todo o histórico";
  const pages = Math.max(1, Math.ceil(filtered.length / 10));

  function setDate(value) {
    setParams(value ? { data: value } : {}, { replace: true });
    setPage(1);
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const decision = await registrarAcesso(Number(student));
      toast.info(decision.resultado === "permitido" ? "Acesso permitido." : "Acesso avaliado. Confira o resultado no histórico.");
      setModal("");
      setStudent("");
      setHistory(await fetchTodosAcessos());
      setPage(1);
    } catch (failure) {
      setError(getApiErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  return <div className="gym-module">
    <PageHeader title="Controle de Acessos" subtitle={currentUnit?.nome} actions={<>
      <Button variant="secondary" onClick={() => { setError(""); setModal("register"); }} disabled={!students.length}><Plus size={17} /> Registrar acesso</Button>
      <Button onClick={() => setModal("day")}><CalendarDays size={17} /> Acessos do Dia</Button>
    </>} />
    {error && modal !== "register" && <p role="alert">{error}</p>}
    {loading ? <p role="status">Carregando acessos…</p> : <>
      <div className="ui-status-grid">
        <KpiCard label="Acessos encontrados" value={filtered.length} subtitle={context} icon={<Radio size={23} />} />
        <KpiCard label="Permitidos" value={allowed} subtitle={context} tone="green" icon={<CircleCheck size={23} />} />
        <KpiCard label="Negados" value={filtered.length - allowed} subtitle={context} tone="red" icon={<CircleX size={23} />} />
        <KpiCard label="Hora de pico" value={peak?.[0] ?? "—"} subtitle={context} tone="amber" icon={<Clock size={23} />} />
      </div>
      <Card className="gym-panel gym-filters">
        <Input label="Buscar aluno" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        <Input label="Data" type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} />
        <Select label="Resultado" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos</option><option value="permitido">Permitido</option><option value="negado">Negado</option>
        </Select>
        <Button variant="secondary" onClick={() => { setQuery(""); setDate(""); setStatus(""); setPage(1); }}>Limpar filtros</Button>
      </Card>
      <Card className="gym-panel">
        <AccessHistory rows={filtered.slice((page - 1) * 10, page * 10)} students={byId} unit={currentUnit} />
        <Pagination page={page} totalPages={pages} onPageChange={setPage} />
      </Card>
    </>}
    {modal === "day" && <ModalAcessosHoje onClose={() => setModal("")} />}
    {modal === "register" && <Modal title="Registrar acesso" onClose={() => { if (!busy) setModal(""); }}>
      <form onSubmit={submit} className="space-y-4">
        <Select label="Aluno" required value={student} onChange={(e) => setStudent(e.target.value)}>
          <option value="">Selecione um aluno</option>
          {students.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.matricula}</option>)}
        </Select>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !student}>{busy ? "Registrando…" : "Registrar acesso"}</Button>
      </form>
    </Modal>}
  </div>;
}
