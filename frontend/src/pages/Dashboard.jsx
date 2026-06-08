import React, { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchAlunos } from "../services/alunoService";
import { fetchTodosAcessos } from "../services/acessoService";
import ModalAcessosHoje from "../components/ModalAcessosHoje";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import KpiCard from "../components/ui/KpiCard";
import PageHeader from "../components/ui/PageHeader";
import Table from "../components/ui/Table";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";

function badgeAcesso(resultado) {
  const status = String(resultado || "").toLowerCase().trim();
  const permitido = status === "permitido" || status === "liberado";
  return <Badge tone={permitido ? "green" : "red"}>{permitido ? "Permitido" : "Negado"}</Badge>;
}

function possuiCoberturaPaga(aluno) {
  return aluno?.cobertura_paga_vigente === true
    || aluno?.cobertura_paga_vigente === 1
    || aluno?.cobertura_status === "cobertura_paga_vigente";
}

export default function Dashboard() {
  const [alunos, setAlunos] = useState([]);
  const [acessos, setAcessos] = useState([]);
  const [erro, setErro] = useState(null);
  const [modalAberto, setModalAberto] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
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
    }
  }

  const totalAlunos = alunos.length;
  const alunosComCobertura = alunos.filter(possuiCoberturaPaga).length;
  const alunosSemCobertura = alunos.filter((aluno) => !possuiCoberturaPaga(aluno)).length;
  const ultimosAcessos = acessos.slice(0, 20);
  const acessosPermitidos = acessos.filter((acesso) => {
    const status = String(acesso.resultado || "").toLowerCase();
    return status === "permitido" || status === "liberado";
  }).length;
  const percentualCobertura = totalAlunos > 0 ? Math.round((alunosComCobertura / totalAlunos) * 100) : 0;

  const pontosAtencao = useMemo(
    () => [
      {
        id: "cobertura",
        titulo: "Cobertura de acesso",
        texto: `${alunosSemCobertura} aluno(s) sem cobertura paga vigente no retorno atual.`,
      },
      {
        id: "acessos",
        titulo: "Fluxo de entrada",
        texto: `${ultimosAcessos.length} acesso(s) recentes monitorados sem expor dados monetários sensíveis.`,
      },
      {
        id: "rotina",
        titulo: "Rotina da unidade",
        texto: "A operação permanece por unidade, com autenticação, permissões e escopo preservados.",
      },
    ],
    [alunosSemCobertura, ultimosAcessos.length]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard Geral"
        subtitle="Visão operacional da academia com foco em alunos, acessos e rotina da unidade."
        actions={<Button variant="secondary" onClick={carregarDados}>Atualizar</Button>}
      />

      <Card className="dashboard-hero">
        <div className="dashboard-hero__content">
          <div>
            <div className="dashboard-hero__eyebrow">
              <ShieldCheck size={14} />
              Operação diária
            </div>
            <h2 className="dashboard-hero__title">Acompanhamento claro da unidade sem misturar dados financeiros sensíveis.</h2>
            <p className="dashboard-hero__description">
              Esta visão permanece operacional: alunos, acessos e sinais de atenção da rotina. O módulo financeiro continua isolado e o consolidado da rede segue somente leitura.
            </p>

            <div className="dashboard-hero__actions">
              <Button onClick={() => navigate("/alunos")}>
                Ver alunos
                <ArrowRight size={15} />
              </Button>
              <Button variant="secondary" onClick={() => setModalAberto(true)}>
                Acessos do Dia
              </Button>
            </div>
          </div>

          <div className="dashboard-hero__meta">
            <div className="dashboard-hero__meta-card">
              <div className="dashboard-hero__meta-label">Presença operacional</div>
              <div className="dashboard-hero__meta-value">{acessosPermitidos}</div>
              <div className="dashboard-hero__meta-copy">Acessos liberados nos registros carregados.</div>
            </div>
            <div className="dashboard-hero__meta-card">
              <div className="dashboard-hero__meta-label">Cobertura vigente</div>
              <div className="dashboard-hero__meta-value">{percentualCobertura}%</div>
              <div className="dashboard-hero__meta-copy">Percentual com cobertura paga vigente no retorno atual.</div>
            </div>
          </div>
        </div>
      </Card>

      {erro && <Card className="p-4 text-red-700 font-semibold">{erro}</Card>}

      <div className="ui-status-grid">
        <KpiCard
          label="Total de alunos"
          value={totalAlunos}
          subtitle="Cadastrados no sistema"
          icon={<Users size={20} />}
          tone="blue"
          onClick={() => navigate("/alunos")}
        />
        <KpiCard
          label="Cobertura vigente"
          value={alunosComCobertura}
          subtitle="Cobertura paga vigente"
          icon={<UserCheck size={20} />}
          tone="green"
        />
        <KpiCard
          label="Sem cobertura paga"
          value={alunosSemCobertura}
          subtitle="Nao assume divida automaticamente"
          icon={<UserX size={20} />}
          tone="amber"
        />
        <KpiCard
          label="Acessos recentes"
          value={ultimosAcessos.length}
          subtitle="Últimos registros carregados"
          icon={<Activity size={20} />}
          tone="gray"
        />
      </div>

      <div className="dashboard-grid">
        <Card className="dashboard-panel">
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Últimos 20 acessos</h2>
              <p className="ui-section-subtitle">Leitura operacional recente, sem indicadores monetários na dashboard comum.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setModalAberto(true)}>
              Ver dia completo
            </Button>
          </div>

          {ultimosAcessos.length === 0 ? (
            <EmptyState title="Nenhum acesso encontrado." />
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
                {ultimosAcessos.map(({ id, nome, data_hora, resultado }) => (
                  <tr key={`${id}-${data_hora}`}>
                    <td className="font-semibold">{nome}</td>
                    <td>{new Date(data_hora).toLocaleString("pt-BR")}</td>
                    <td>{badgeAcesso(resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="dashboard-panel">
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Pontos de atenção</h2>
              <p className="ui-section-subtitle">Sinais rápidos para a rotina operacional da unidade.</p>
            </div>
          </div>

          <div className="dashboard-panel__body">
            <div className="dashboard-attention-list">
              {pontosAtencao.map((item) => (
                <div key={item.id} className="dashboard-attention-item">
                  <div className="dashboard-attention-item__icon">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <h3 className="dashboard-attention-item__title">{item.titulo}</h3>
                    <p className="dashboard-attention-item__text">{item.texto}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {modalAberto && <ModalAcessosHoje onClose={() => setModalAberto(false)} />}
    </div>
  );
}
