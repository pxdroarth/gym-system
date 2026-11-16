import { Building2, CircleCheck, CircleX } from "lucide-react";
import { Link } from "react-router-dom";
import Badge from "./ui/Badge";
import Table from "./ui/Table";

const timeZone = "America/Sao_Paulo";
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone });
const hourFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", hourCycle: "h23" });
const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone, dateStyle: "short", timeStyle: "short",
});

export function accessInstant(value) {
  const raw = String(value ?? "").replace(" ", "T");
  return new Date(/^\d{4}-\d\d-\d\dT[\d:.]+$/.test(raw) ? raw + "Z" : raw);
}

export function operationalDay(value = new Date()) {
  return Number.isNaN(value.getTime()) ? "" : dayFormatter.format(value);
}

export function accessHour(instant) {
  return Number.isNaN(instant.getTime()) ? "" : hourFormatter.format(instant) + "h";
}

export function accessDateTime(value) {
  const instant = accessInstant(value);
  return Number.isNaN(instant.getTime()) ? "—" : dateTimeFormatter.format(instant);
}

export function allowedAccess(row) {
  return ["permitido", "liberado"].includes(String(row.resultado).toLowerCase());
}

export function StudentIdentity({ student, fallback }) {
  const name = student?.nome || fallback || "Aluno";
  const initials = name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  return <span className="gym-entity">
    <span className="gym-entity__avatar" aria-hidden="true">{initials}</span>
    <span>{student?.id ? <Link to={`/alunos/${student.id}`}>{name}</Link> : name}
      {student?.matricula && <small>Matrícula: {student.matricula}</small>}
    </span>
  </span>;
}

export default function AccessHistory({ rows, students, unit }) {
  return <Table aria-label="Histórico de acessos">
    <thead><tr><th>Data e hora</th><th>Aluno</th><th>Operador</th><th>Unidade</th><th>Resultado</th><th>Motivo</th></tr></thead>
    <tbody>{rows.length ? rows.map((row) => {
      const allowed = allowedAccess(row);
      return <tr key={row.id}>
        <td className="whitespace-nowrap">{accessDateTime(row.data_hora)}</td>
        <td><StudentIdentity student={students.get(row.aluno_id)} fallback={row.aluno_nome} /></td>
        <td>{row.operador || "—"}</td>
        <td><span className="inline-flex items-center gap-2"><Building2 size={15} />{unit?.nome}</span></td>
        <td><Badge tone={allowed ? "green" : "red"}>{allowed ? <CircleCheck size={13} /> : <CircleX size={13} />}{allowed ? "Permitido" : "Negado"}</Badge></td>
        <td>{row.motivo_bloqueio?.replaceAll("_", " ") || "—"}</td>
      </tr>;
    }) : <tr><td colSpan={6}>Nenhum acesso neste recorte.</td></tr>}</tbody>
  </Table>;
}
