import { useEffect, useState } from "react";
import { CheckCircle2, CircleSlash, Plus, Users, WalletCards } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { accessDateTime, StudentIdentity } from "../../components/AccessHistory";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import Select from "../../components/ui/Select";
import Table from "../../components/ui/Table";
import useAuth from "../../hooks/useAuth";
import { fetchAlunos } from "../../services/alunoService";
import { fetchTodosAcessos } from "../../services/acessoService";
import getApiErrorMessage from "../../utils/getApiErrorMessage";
import { UI_PERMISSIONS } from "../../utils/permissions";

const desc = import.meta.env.VITE_ALUNOS_ORDER?.toLowerCase() === "desc";
const statusOf = (student) => String(student.status_ativo ?? student.status ?? "").toLowerCase();
const normalized = (value) => String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const coverageOf = (student) => [true, 1].includes(student.cobertura_paga_vigente)
  || student.cobertura_status === "cobertura_paga_vigente" ? "vigente"
    : "cobertura_paga_vigente" in student || "cobertura_status" in student ? "sem" : "desconhecida";
const coverageLabel = { vigente: "Cobertura vigente", sem: "Sem cobertura paga", desconhecida: "Cobertura não informada" };

export default function AlunosPage() {
  const { currentUnit } = useAuth();
  const [params, setParams] = useSearchParams();
  const [students, setStudents] = useState(null);
  const [lastAccess, setLastAccess] = useState(new Map());
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [page, setPage] = useState(1);
  const coverage = params.get("cobertura") || "";

  useEffect(() => {
    let active = true;
    fetchAlunos().then((data) => {
      if (active) setStudents(data.slice().sort((a, b) =>
        (desc ? -1 : 1) * (Number(a.matricula || a.id) - Number(b.matricula || b.id))));
    }).catch((failure) => { if (active) setError(getApiErrorMessage(failure)); });
    fetchTodosAcessos().then((rows) => {
      if (!active) return;
      const latest = new Map();
      for (const row of rows) if (!latest.has(row.aluno_id)) latest.set(row.aluno_id, row.data_hora);
      setLastAccess(latest);
    }).catch((failure) => { if (active) setError(getApiErrorMessage(failure)); });
    return () => { active = false; };
  }, []);

  const rows = students || [];
  const activeCount = rows.filter((row) => statusOf(row) === "ativo").length;
  const inactiveCount = rows.filter((row) => statusOf(row) === "inativo").length;
  const plans = [...new Set(rows.map((row) => row.plano_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtered = rows.filter((row) =>
    (!status || statusOf(row) === status) && (!coverage || coverageOf(row) === coverage) && (!plan || row.plano_nome === plan)
    && [row.nome, row.matricula, row.telefone].some((value) => normalized(value).includes(normalized(query.trim()))));
  const size = 6;
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const activePage = Math.min(page, pages);

  return <div className="gym-module">
    <PageHeader title="Alunos" subtitle={`Cadastro e situação operacional · ${currentUnit?.nome || "Unidade"}`}
      actions={<RoleGate permission={UI_PERMISSIONS.ALUNOS_EDITAR}><Button as={Link} to="/alunos/novo"><Plus size={16} /> Novo Aluno</Button></RoleGate>} />
    {error && <p role="alert">{error}</p>}
    {!students && !error && <p role="status">Carregando alunos…</p>}
    {students && <>
      <div className="ui-status-grid gym-three">
        <KpiCard label="Total de alunos" value={rows.length} icon={<Users size={25} />} />
        <KpiCard label="Ativos" value={activeCount} icon={<CheckCircle2 size={25} />} tone="green" subtitle="Status operacional atual" />
        <KpiCard label="Inativos" value={inactiveCount} icon={<CircleSlash size={25} />} tone="amber" subtitle="Status operacional atual" />
      </div>
      <Card className="gym-panel gym-filters">
        <Input label="Buscar aluno" placeholder="Nome, matrícula ou telefone" type="search" value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        <Select label="Status operacional" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">Todos</option><option value="ativo">Ativo</option><option value="inativo">Inativo</option>
        </Select>
        <Select label="Plano" value={plan} onChange={(e) => { setPlan(e.target.value); setPage(1); }}>
          <option value="">Todos</option>{plans.map((name) => <option key={name}>{name}</option>)}
        </Select>
        <Select label="Cobertura" value={coverage} onChange={(e) => {
          setParams(e.target.value ? { cobertura: e.target.value } : {}, { replace: true });
          setPage(1);
        }}>
          <option value="">Todas</option>{Object.entries(coverageLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => { setQuery(""); setStatus(""); setPlan(""); setParams({}, { replace: true }); setPage(1); }}>Limpar filtros</Button>
      </Card>
      <Card>
        <Table aria-label="Lista de alunos">
          <thead><tr><th>Aluno</th><th>Plano</th><th>Status operacional</th><th>Cobertura</th><th>Unidade</th><th>Último acesso</th><th>Ações</th></tr></thead>
          <tbody>{filtered.length ? filtered.slice((activePage - 1) * size, activePage * size).map((row) => {
            const situation = statusOf(row);
            const coverage = coverageOf(row);
            return <tr key={row.id}>
              <td><StudentIdentity student={row} /></td>
              <td>{row.plano_nome || "Sem plano"}</td>
              <td><Badge tone={situation === "ativo" ? "green" : "amber"}>{({ ativo: "Ativo", inativo: "Inativo", bloqueado: "Bloqueado" })[situation] || "Não informado"}</Badge></td>
              <td><Badge tone={coverage === "vigente" ? "green" : coverage === "sem" ? "amber" : "gray"}><WalletCards size={13} />{coverageLabel[coverage]}</Badge></td>
              <td>{currentUnit?.nome}</td>
              <td className="whitespace-nowrap">{accessDateTime(lastAccess.get(row.id))}</td>
              <td><Button as={Link} to={`/alunos/${row.id}`} size="sm" variant="secondary">Perfil</Button></td>
            </tr>;
          }) : <tr><td colSpan={7}>Nenhum aluno encontrado.</td></tr>}</tbody>
        </Table>
        <div className="gym-table-footer"><span>{filtered.length} aluno(s)</span><Pagination page={activePage} totalPages={pages} onPageChange={setPage} /></div>
      </Card>
      <Card className="gym-panel">
        <div className="gym-panel__head"><h2 className="ui-section-title">Cobertura paga</h2></div>
        <div className="gym-filters">
          {Object.entries(coverageLabel).map(([key, label]) => <Button key={key}
            variant={coverage === key ? "primary" : "secondary"} aria-pressed={coverage === key}
            onClick={() => { setParams(coverage === key ? {} : { cobertura: key }, { replace: true }); setPage(1); }}>
            {label} <strong>{rows.filter((row) => coverageOf(row) === key).length}</strong>
          </Button>)}
        </div>
      </Card>
    </>}
  </div>;
}
