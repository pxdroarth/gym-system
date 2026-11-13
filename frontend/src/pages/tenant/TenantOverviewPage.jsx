import React, { useEffect, useMemo, useState } from "react";
import { Building2, DollarSign, Landmark, Users } from "lucide-react";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import MovementChart from "../../components/ui/MovementChart";
import PageHeader from "../../components/ui/PageHeader";
import Table from "../../components/ui/Table";
import { fetchTenantOverview } from "../../services/tenantService";
import getApiErrorMessage from "../../utils/getApiErrorMessage";
import { UI_PERMISSIONS } from "../../utils/permissions";

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function TenantOverviewPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let active = true;

    async function carregar() {
      try {
        setLoading(true);
        const resposta = await fetchTenantOverview();
        if (active) setData(resposta.data);
      } catch (error) {
        if (active) setErro(getApiErrorMessage(error));
      } finally {
        if (active) setLoading(false);
      }
    }

    carregar();

    return () => {
      active = false;
    };
  }, []);

  const resumo = useMemo(() => {
    const unidades = data?.unidades || [];
    return {
      unidadesAtivas: unidades.filter((unit) => unit.status === "ativa").length,
    };
  }, [data]);
  const restrito = data?.escopo === "unidades_autorizadas_readonly";
  const escopo = restrito ? "Unidades autorizadas" : "Toda a rede";

  return (
    <RoleGate
      permission={UI_PERMISSIONS.TENANT_CONSOLIDADO_VISUALIZAR}
      fallback={
        <EmptyState
          title="Area restrita"
          description="O Consolidado da Rede fica disponivel apenas para perfis autorizados."
        />
      }
    >
      <div className="gym-module">
        <PageHeader
          title={restrito ? "Relatório das unidades autorizadas" : "Consolidado da Rede"}
          subtitle={data && `${data.tenant?.nome || "Rede"} · ${escopo}`}
          actions={<Badge tone="blue">Somente leitura</Badge>}
        />

        {loading ? (
          <EmptyState title="Carregando consolidado..." />
        ) : erro ? (
          <EmptyState title={erro} />
        ) : (
          <>
            <div className="ui-status-grid">
              <KpiCard label="Unidades ativas" value={resumo.unidadesAtivas} subtitle="Cadastro atual" icon={<Building2 size={20} />} tone="blue" />
              <KpiCard label="Alunos ativos" value={data?.totais?.alunos_ativos || 0} subtitle="Cadastro atual" icon={<Users size={20} />} tone="green" />
              <KpiCard label="Receita consolidada" value={moeda(data?.totais?.receitas)} subtitle="Histórico acumulado" icon={<DollarSign size={20} />} tone="blue" />
              <KpiCard
                label="Saldo consolidado"
                subtitle="Histórico acumulado"
                value={moeda(data?.totais?.saldo)}
                icon={<Landmark size={20} />}
                tone={Number(data?.totais?.saldo || 0) >= 0 ? "green" : "red"}
              />
            </div>

            <Card className="governance-table-card">
              <div className="governance-panel__body">
                <div className="ui-section-header">
                  <div>
                    <h2 className="ui-section-title">Comparativo por unidade</h2>
                    <p className="ui-section-subtitle">Cadastros atuais · Vendas e valores no histórico acumulado</p>
                  </div>
                  <Badge tone="gray">Somente leitura</Badge>
                </div>

                <Table>
                  <thead>
                    <tr>
                      <th>Unidade</th>
                      <th>Status</th>
                      <th>Alunos</th>
                      <th>Produtos</th>
                      <th>Vendas</th>
                      <th>Receitas</th>
                      <th>Despesas</th>
                      <th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.unidades || []).map((unit) => (
                      <tr key={unit.id}>
                        <td className="font-semibold">
                          {unit.nome} {Number(unit.is_matriz) === 1 && <Badge tone="blue" className="ml-2">Matriz</Badge>}
                        </td>
                        <td><Badge tone={unit.status === "ativa" ? "green" : "amber"}>{unit.status === "ativa" ? "Ativa" : unit.status}</Badge></td>
                        <td>{unit.alunos_ativos}</td>
                        <td>{unit.produtos}</td>
                        <td>{unit.vendas}</td>
                        <td>{moeda(unit.receitas)}</td>
                        <td>{moeda(unit.despesas)}</td>
                        <td>{moeda(unit.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </Card>
            <Card className="gym-panel">
              <div className="gym-panel__head"><div><h2 className="ui-section-title">Receitas e despesas por unidade</h2><p>Histórico acumulado · {escopo}</p></div></div>
              <MovementChart title="Receitas e despesas por unidade" format={moeda}
                data={(data?.unidades || []).map((unit) => ({ label: unit.nome, entries: unit.receitas, expenses: -unit.despesas }))}
                bars={[{ key: "entries", label: "Receitas" }, { key: "expenses", label: "Despesas" }]} />
            </Card>
          </>
        )}
      </div>
    </RoleGate>
  );
}
