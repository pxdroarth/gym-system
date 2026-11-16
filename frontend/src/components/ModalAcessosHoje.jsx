import { useEffect, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { Link } from "react-router-dom";
import AccessHistory, { accessInstant, operationalDay } from "./AccessHistory";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Modal from "./ui/Modal";
import useAuth from "../hooks/useAuth";
import { fetchAlunos } from "../services/alunoService";
import { fetchTodosAcessos } from "../services/acessoService";
import getApiErrorMessage from "../utils/getApiErrorMessage";

export default function ModalAcessosHoje({ onClose }) {
  const { currentUnit } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [ascending, setAscending] = useState(false);
  const today = operationalDay();

  useEffect(() => {
    let active = true;
    Promise.all([fetchTodosAcessos(), fetchAlunos()]).then(([access, students]) => {
      if (active) setData({ access, students: new Map(students.map((student) => [student.id, student])) });
    }).catch((failure) => { if (active) setError(getApiErrorMessage(failure)); });
    return () => { active = false; };
  }, []);

  const rows = data?.access.filter((row) => {
    const name = data.students.get(row.aluno_id)?.nome || row.aluno_nome || "";
    return operationalDay(accessInstant(row.data_hora)) === today
      && name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"));
  }) ?? [];
  if (ascending) rows.reverse();

  return (
    <Modal title="Acessos do Dia" onClose={onClose} className="max-w-5xl" footer={
      <Link to={`/acessos?data=${today}`} onClick={onClose}>Ver todos os acessos →</Link>
    }>
      <div className="space-y-4">
        <p>{currentUnit?.nome} · {today.split("-").reverse().join("/")} · {rows.length} registro(s)</p>
        <div className="gym-filters">
          <Input label="Buscar aluno" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button variant="secondary" onClick={() => setAscending(!ascending)}>
            <ArrowDownUp size={15} /> {ascending ? "Mais antigos primeiro" : "Mais recentes primeiro"}
          </Button>
        </div>
        {error ? <p role="alert">{error}</p> : data ?
          <AccessHistory rows={rows} students={data.students} unit={currentUnit} /> : <p role="status">Carregando acessos…</p>}
      </div>
    </Modal>
  );
}
