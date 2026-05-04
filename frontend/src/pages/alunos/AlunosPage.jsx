import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleSlash, Search, Users, WalletCards } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { fetchAlunos } from "../../services/Api";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import Table from "../../components/ui/Table";

const ORDER = (import.meta.env?.VITE_ALUNOS_ORDER || "asc").toLowerCase();

function obterBadgeMensalidade(status) {
  switch (status) {
    case "em_dia":
      return <Badge tone="green">Em dia</Badge>;
    case "atrasado":
      return <Badge tone="red">Atrasado</Badge>;
    case "sem_mensalidade":
      return <Badge tone="gray">Sem mensalidade</Badge>;
    default:
      return <Badge tone="gray">{status || "-"}</Badge>;
  }
}

function obterBadgeStatus(status) {
  return String(status).toLowerCase() === "ativo"
    ? <Badge tone="green">Ativo</Badge>
    : <Badge tone="red">Inativo</Badge>;
}

export default function AlunosPage() {
  const [alunos, setAlunos] = useState([]);
  const [busca, setBusca] = useState("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [itensPorPagina] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    carregarAlunos();
  }, []);

  async function carregarAlunos() {
    try {
      const dados = await fetchAlunos();
      const normalizados = (dados || []).map((aluno) => ({
        ...aluno,
        status_ativo: aluno.status_ativo || aluno.status || "inativo",
        mensalidade_status: aluno.mensalidade_status || "sem_mensalidade",
      }));

      normalizados.sort((a, b) => {
        const va = Number(a.matricula || a.id || 0);
        const vb = Number(b.matricula || b.id || 0);
        return ORDER === "desc" ? vb - va : va - vb;
      });

      setAlunos(normalizados);
      setPaginaAtual(1);
    } catch (error) {
      console.error("Erro ao buscar alunos:", error);
    }
  }

  const totalAlunos = alunos.length;
  const totalEmDia = alunos.filter((aluno) => aluno.mensalidade_status === "em_dia").length;
  const totalAtrasados = alunos.filter((aluno) => aluno.mensalidade_status === "atrasado").length;
  const totalSemMensalidade = alunos.filter((aluno) => aluno.mensalidade_status === "sem_mensalidade").length;

  const termo = busca.toLowerCase();
  const alunosFiltrados = alunos.filter(
    (aluno) => (aluno.nome || "").toLowerCase().includes(termo) || String(aluno.matricula || "").includes(busca)
  );

  const indexUltimoItem = paginaAtual * itensPorPagina;
  const indexPrimeiroItem = indexUltimoItem - itensPorPagina;
  const alunosPaginados = alunosFiltrados.slice(indexPrimeiroItem, indexUltimoItem);
  const totalPaginas = Math.max(1, Math.ceil(alunosFiltrados.length / itensPorPagina));

  const cardsResumo = useMemo(
    () => [
      {
        id: "ativos",
        label: "Cadastros localizados",
        value: alunosFiltrados.length,
        copy: "Resultados no recorte atual de busca.",
      },
      {
        id: "emdia",
        label: "Mensalidade em dia",
        value: totalEmDia,
        copy: "Base operacional regularizada.",
      },
      {
        id: "atrasados",
        label: "Atenção imediata",
        value: totalAtrasados,
        copy: "Alunos com atraso no recorte atual.",
      },
    ],
    [alunosFiltrados.length, totalEmDia, totalAtrasados]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alunos"
        subtitle="Cadastro, situação operacional e acompanhamento de mensalidades por unidade."
        actions={
          <Button as={Link} to="/alunos/novo" variant="primary">
            + Novo Aluno
          </Button>
        }
      />

      <div className="ui-status-grid">
        <KpiCard label="Total de Alunos" value={totalAlunos} icon={<Users size={20} />} tone="blue" />
        <KpiCard label="Em Dia" value={totalEmDia} icon={<CheckCircle2 size={20} />} tone="green" />
        <KpiCard label="Atrasados" value={totalAtrasados} icon={<CircleSlash size={20} />} tone="red" />
        <KpiCard label="Sem Mensalidade" value={totalSemMensalidade} icon={<WalletCards size={20} />} tone="gray" />
      </div>

      <Card>
        <div className="entity-toolbar">
          <div className="entity-toolbar__intro">
            <span className="entity-toolbar__eyebrow">Leitura operacional</span>
            <div>
              <h2 className="ui-section-title">Listagem de alunos</h2>
              <p className="ui-section-subtitle">Consulta rápida, visual mais denso e navegação direta para o perfil.</p>
            </div>
          </div>
          <div className="entity-toolbar__actions">
            <div className="entity-toolbar__search">
              <Input
                type="text"
                placeholder="Buscar por nome ou matrícula"
                value={busca}
                onChange={(event) => {
                  setBusca(event.target.value);
                  setPaginaAtual(1);
                }}
              />
            </div>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div className="entity-summary-grid">
            {cardsResumo.map((item) => (
              <div key={item.id} className="entity-summary-card">
                <div className="entity-summary-card__label">{item.label}</div>
                <div className="entity-summary-card__value">{item.value}</div>
                <div className="entity-summary-card__copy">{item.copy}</div>
              </div>
            ))}
          </div>

          {alunosPaginados.length === 0 ? (
            <EmptyState title="Nenhum aluno encontrado." description="Tente ajustar a busca ou cadastre um novo aluno." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Matrícula</th>
                  <th>Aluno</th>
                  <th>Status</th>
                  <th>Mensalidade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {alunosPaginados.map((aluno) => (
                  <tr key={aluno.id}>
                    <td className="font-mono text-sm text-slate-600">{aluno.matricula}</td>
                    <td>
                      <div className="students-table__name">
                        <span className="font-semibold">{aluno.nome}</span>
                        <span className="students-table__meta">
                          <Search size={12} className="inline mr-1" />
                          Acesso rápido ao perfil operacional
                        </span>
                      </div>
                    </td>
                    <td>{obterBadgeStatus(aluno.status_ativo)}</td>
                    <td>{obterBadgeMensalidade(aluno.mensalidade_status)}</td>
                    <td>
                      <Button size="sm" onClick={() => navigate(`/alunos/${aluno.id}`)}>
                        Perfil
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          <Pagination page={paginaAtual} totalPages={totalPaginas} onPageChange={setPaginaAtual} />
        </div>
      </Card>
    </div>
  );
}
