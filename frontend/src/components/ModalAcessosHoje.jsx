import React, { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, CalendarDays, ShieldCheck } from "lucide-react";
import { fetchAlunos, fetchTodosAcessos } from "../services/Api";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";
import Input from "./ui/Input";
import Modal from "./ui/Modal";
import Table from "./ui/Table";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";

function badgeAcesso(resultado) {
  const status = String(resultado || "").toLowerCase();
  const permitido = status === "permitido" || status === "liberado";
  return (
    <span className="access-status-cell">
      <span className={`access-status-dot ${permitido ? "access-status-dot--green" : "access-status-dot--red"}`} />
      <Badge tone={permitido ? "green" : "red"}>{permitido ? "Permitido" : "Negado"}</Badge>
    </span>
  );
}

export default function ModalAcessosHoje({ onClose }) {
  const [acessos, setAcessos] = useState([]);
  const [ordenAsc, setOrdenAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filtroNome, setFiltroNome] = useState("");
  const [erro, setErro] = useState(null);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      try {
        setErro(null);
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
          const aluno = listaAlunos.find((item) => item.id === acesso.aluno_id);
          return { ...acesso, nome: aluno ? aluno.nome : "Aluno desconhecido" };
        });

        setAcessos(acessosComNome);
      } catch (error) {
        setErro(getApiErrorMessage(error));
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const acessosFiltrados = acessos.filter((acesso) => acesso.nome.toLowerCase().includes(filtroNome.toLowerCase()));
  const acessosOrdenados = acessosFiltrados.slice().sort((a, b) => (
    ordenAsc
      ? new Date(a.data_hora) - new Date(b.data_hora)
      : new Date(b.data_hora) - new Date(a.data_hora)
  ));

  const totalPermitidos = useMemo(
    () => acessosOrdenados.filter((acesso) => {
      const status = String(acesso.resultado || "").toLowerCase();
      return status === "permitido" || status === "liberado";
    }).length,
    [acessosOrdenados]
  );

  return (
    <Modal
      title="Acessos do Dia"
      onClose={onClose}
      className="max-w-5xl"
      footer={(
        <div className="flex justify-between items-center w-full gap-3">
          <span className="text-sm text-slate-500">{acessosOrdenados.length} acesso(s) encontrado(s)</span>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="access-modal-toolbar">
          <div className="access-modal-toolbar__stats">
            <div className="entity-summary-card">
              <div className="entity-summary-card__label">Registros do dia</div>
              <div className="entity-summary-card__value">{acessosOrdenados.length}</div>
              <div className="entity-summary-card__copy">Fluxo filtrado dentro da data atual.</div>
            </div>
            <div className="entity-summary-card">
              <div className="entity-summary-card__label">Liberados</div>
              <div className="entity-summary-card__value">{totalPermitidos}</div>
              <div className="entity-summary-card__copy">Leitura rápida do status operacional.</div>
            </div>
          </div>

          <div className="access-modal-toolbar__search space-y-3">
            <Input
              type="text"
              placeholder="Filtrar por nome"
              value={filtroNome}
              onChange={(event) => setFiltroNome(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setOrdenAsc(!ordenAsc)}>
                <ArrowDownUp size={15} />
                Ordenar {ordenAsc ? "crescente" : "decrescente"}
              </Button>
              <Badge tone="blue"><CalendarDays size={12} className="mr-1 inline" /> Hoje</Badge>
              <Badge tone="green"><ShieldCheck size={12} className="mr-1 inline" /> Overlay via portal</Badge>
            </div>
          </div>
        </div>

        {loading ? (
          <EmptyState title="Carregando acessos..." />
        ) : erro ? (
          <EmptyState title={erro} />
        ) : acessosOrdenados.length === 0 ? (
          <EmptyState title="Nenhum acesso encontrado para hoje." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Data/Hora</th>
                <th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {acessosOrdenados.map(({ id, nome, data_hora, resultado }) => (
                <tr key={id}>
                  <td className="font-semibold">{nome}</td>
                  <td>{new Date(data_hora).toLocaleString("pt-BR")}</td>
                  <td>{badgeAcesso(resultado)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </Modal>
  );
}
