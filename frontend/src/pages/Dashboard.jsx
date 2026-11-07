import React, { useEffect, useState } from "react";
import { ChevronRight, DoorOpen, RefreshCw, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchAlunos } from "../services/alunoService";
import { fetchTodosAcessos } from "../services/acessoService";
import ModalAcessosHoje from "../components/ModalAcessosHoje";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import { Table } from "../components/ui/Table";
import useAuth from "../hooks/useAuth";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";

const LIMITE_ACESSOS = 20;

const MOTIVOS_BLOQUEIO = {
  mensalidade_vencida: "Mensalidade vencida",
  responsavel_inadimplente: "Responsável inadimplente",
  aluno_inativo: "Aluno inativo",
  aluno_bloqueado: "Aluno bloqueado",
  sem_mensalidade_registrada: "Sem mensalidade registrada",
  sem_mensalidade_vigente: "Sem mensalidade vigente",
  sem_cobertura_paga_vigente: "Sem cobertura paga",
  vinculo_irregular: "Vínculo irregular",
};

function acessoPermitido(resultado) {
  const status = String(resultado || "").toLowerCase().trim();
  return status === "permitido" || status === "liberado";
}

function possuiCoberturaPaga(aluno) {
  return aluno?.cobertura_paga_vigente === true
    || aluno?.cobertura_paga_vigente === 1
    || aluno?.cobertura_status === "cobertura_paga_vigente";
}

function descreverMotivo(motivo) {
  if (!motivo) return null;
  return MOTIVOS_BLOQUEIO[motivo] || String(motivo).replace(/_/g, " ");
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

// "Hoje, 07:15" / "Ontem, 07:15" / "05/11, 07:15": leitura rapida na recepcao.
function formatarDataHora(valor) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "-";
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dias = Math.round((inicioDoDia(new Date()) - inicioDoDia(data)) / 86400000);
  if (dias === 0) return `Hoje, ${hora}`;
  if (dias === 1) return `Ontem, ${hora}`;
  return `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hora}`;
}

function hojePorExtenso() {
  return new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export default function Dashboard() {
  const { currentUnit } = useAuth();
  const [alunos, setAlunos] = useState([]);
  const [acessos, setAcessos] = useState([]);
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setCarregando(true);
    try {
      const listaAlunos = await fetchAlunos();
      setAlunos(listaAlunos);

      const todosAcessos = await fetchTodosAcessos();
      const acessosComNome = todosAcessos.map((acesso) => {
        const aluno = listaAlunos.find((item) => item.id === acesso.aluno_id);
        return { ...acesso, nome: aluno ? aluno.nome : "Aluno desconhecido" };
      });

      setAcessos(acessosComNome.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora)));
      setErro(null);
    } catch (error) {
      setErro(getApiErrorMessage(error));
    } finally {
      setCarregando(false);
    }
  }

  const totalAlunos = alunos.length;
  const alunosSemCobertura = alunos.filter((aluno) => !possuiCoberturaPaga(aluno));
  const alunosComCobertura = totalAlunos - alunosSemCobertura.length;
  const percentualCobertura = totalAlunos > 0 ? Math.round((alunosComCobertura / totalAlunos) * 100) : 0;
  const ultimosAcessos = acessos.slice(0, LIMITE_ACESSOS);
  const permitidos = ultimosAcessos.filter((acesso) => acessoPermitido(acesso.resultado)).length;
  const negados = ultimosAcessos.length - permitidos;

  return (
    <div className="ops-page">
      <Card className="ops-header">
        <div className="ops-header__main">
          <h1 className="ops-header__title">Dashboard</h1>
          <p className="ops-header__meta">
            {currentUnit?.nome && <span className="ops-header__context">{currentUnit.nome}</span>}
            {currentUnit?.nome && " · "}
            {hojePorExtenso()}
          </p>
        </div>
        <div className="ops-header__actions">
          <Button onClick={() => navigate("/alunos")}>
            <Users size={16} aria-hidden="true" />
            Alunos
          </Button>
          <Button variant="secondary" onClick={() => setModalAberto(true)}>
            <DoorOpen size={16} aria-hidden="true" />
            Acessos do Dia
          </Button>
          <Button
            variant="ghost"
            className="ops-icon-button"
            onClick={carregarDados}
            disabled={carregando}
            aria-label="Atualizar dados"
            title="Atualizar dados"
          >
            <RefreshCw size={16} aria-hidden="true" className={carregando ? "ops-spin" : undefined} />
          </Button>
        </div>
      </Card>

      {erro && <div className="ops-alert" role="alert">{erro}</div>}

      <Card className="ops-stats" aria-label="Indicadores da unidade">
        <Link to="/alunos" className="ops-stat ops-stat--link">
          <span className="ops-stat__label">Alunos cadastrados</span>
          <span className="ops-stat__value">{totalAlunos}</span>
          <span className="ops-stat__hint">Ver lista <ChevronRight size={13} aria-hidden="true" /></span>
        </Link>
        <div className="ops-stat">
          <span className="ops-stat__label">Com cobertura paga</span>
          <span className="ops-stat__value">
            {alunosComCobertura}
            <span className="ops-stat__suffix">{percentualCobertura}%</span>
          </span>
          {/* Decorativa: o percentual ao lado do numero ja informa o valor. */}
          <span className="ops-meter" aria-hidden="true">
            <span className="ops-meter__fill" style={{ width: `${Math.min(100, Math.max(0, percentualCobertura))}%` }} />
          </span>
          <span className="ops-stat__hint">do total de alunos</span>
        </div>
        <div className="ops-stat">
          <span className="ops-stat__label">Sem cobertura paga</span>
          <span className={`ops-stat__value ${alunosSemCobertura.length ? "ops-stat__value--warning" : ""}`}>
            {alunosSemCobertura.length}
          </span>
          <span className="ops-stat__hint">Não gera dívida automática</span>
        </div>
      </Card>

      <div className="ops-grid">
        <Card className="ops-panel">
          <div className="ops-panel__header">
            <div className="ops-panel__heading">
              <h2 className="ops-panel__title">Últimos acessos</h2>
              {ultimosAcessos.length > 0 && (
                <span className="ops-panel__counts">
                  <span className="ops-status ops-status--success">
                    {permitidos} {permitidos === 1 ? "permitido" : "permitidos"}
                  </span>
                  <span className={`ops-status ${negados ? "ops-status--danger" : ""}`}>
                    {negados} {negados === 1 ? "negado" : "negados"}
                  </span>
                </span>
              )}
            </div>
            <Button size="sm" variant="secondary" onClick={() => setModalAberto(true)}>
              Ver dia completo
            </Button>
          </div>

          {ultimosAcessos.length === 0 ? (
            <EmptyState
              title={carregando ? "Carregando acessos..." : "Nenhum acesso registrado nesta unidade."}
            />
          ) : (
            <Table className="ops-table ops-table--acessos">
              <thead>
                <tr>
                  <th scope="col">Aluno</th>
                  <th scope="col">Data e hora</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {ultimosAcessos.map(({ id, nome, data_hora, resultado, motivo_bloqueio }) => {
                  const permitido = acessoPermitido(resultado);
                  return (
                    <tr key={`${id}-${data_hora}`}>
                      <td className="ops-table__primary">{nome}</td>
                      <td className="ops-table__time">{formatarDataHora(data_hora)}</td>
                      <td className="ops-table__status">
                        <span className={`ops-status ${permitido ? "ops-status--success" : "ops-status--danger"}`}>
                          {permitido ? "Permitido" : "Negado"}
                        </span>
                      </td>
                      <td className="ops-table__detail">
                        {!permitido && motivo_bloqueio ? descreverMotivo(motivo_bloqueio) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="ops-panel">
          <div className="ops-panel__header">
            <h2 className="ops-panel__title">Sem cobertura paga</h2>
            <span className="ops-panel__aside">
              {alunosSemCobertura.length} {alunosSemCobertura.length === 1 ? "aluno" : "alunos"}
            </span>
          </div>
          {alunosSemCobertura.length === 0 ? (
            <EmptyState title={carregando ? "Carregando alunos..." : "Todos os alunos têm cobertura paga vigente."} />
          ) : (
            <ul className="ops-list">
              {alunosSemCobertura.slice(0, 8).map((aluno) => (
                <li key={aluno.id}>
                  <Link to={`/alunos/${aluno.id}`} className="ops-list__item">
                    <span className="ops-list__name">{aluno.nome}</span>
                    <span className="ops-list__meta">
                      {String(aluno.status || "").toLowerCase() === "inativo" ? "Inativo" : `Matrícula ${aluno.matricula ?? "-"}`}
                    </span>
                    <ChevronRight size={15} aria-hidden="true" className="ops-list__chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {alunosSemCobertura.length > 8 && (
            <div className="ops-panel__footer">
              <Link to="/alunos" className="ops-link">Ver todos os {alunosSemCobertura.length} alunos</Link>
            </div>
          )}
        </Card>
      </div>

      {modalAberto && <ModalAcessosHoje onClose={() => setModalAberto(false)} />}
    </div>
  );
}
