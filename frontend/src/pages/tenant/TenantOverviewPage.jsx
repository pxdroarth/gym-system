import React, { useEffect, useState } from "react";
import { Building2, DollarSign, Landmark, Users } from "lucide-react";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import RestrictedAreaNotice from "../../components/ui/RestrictedAreaNotice";
import Table from "../../components/ui/Table";
import { fetchTenantOverview } from "../../services/tenantService";
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
        if (active) setErro(error?.response?.data?.error || error.message || "Erro ao carregar visão consolidada.");
      } finally {
        if (active) setLoading(false);
      }
    }
    carregar();
    return () => {
      active = false;
    };
  }, []);

  return (
    <RoleGate permission={UI_PERMISSIONS.TENANT_OVERVIEW_VISUALIZAR} fallback={<EmptyState title="Área restrita a owner/admin." />}>
      <div className="space-y-6">
        <PageHeader
          title="Visão Consolidada"
          subtitle="Leitura gerencial do tenant. Operações continuam restritas à unidade atual."
        />

        <RestrictedAreaNotice
          title="Somente leitura"
          badgeLabel="Read-only"
          description="Esta visão consolida indicadores do tenant para owner/admin. Criações, edições, reversões e fechamento mensal seguem por unidade."
        />

        {loading ? (
          <EmptyState title="Carregando visão consolidada..." />
        ) : erro ? (
          <EmptyState title={erro} />
        ) : (
          <>
            <div className="ui-status-grid">
              <KpiCard label="Unidades" value={data?.totais?.unidades || 0} icon={<Building2 size={20} />} tone="blue" />
              <KpiCard label="Alunos ativos" value={data?.totais?.alunos_ativos || 0} icon={<Users size={20} />} tone="green" />
              <KpiCard label="Receitas" value={moeda(data?.totais?.receitas)} icon={<DollarSign size={20} />} tone="blue" />
              <KpiCard label="Saldo" value={moeda(data?.totais?.saldo)} icon={<Landmark size={20} />} tone={Number(data?.totais?.saldo || 0) >= 0 ? "green" : "red"} />
            </div>

            <Card>
              <div className="ui-section-header">
                <div>
                  <h2 className="ui-section-title">{data?.tenant?.nome || "Tenant"}</h2>
                  <p className="ui-section-subtitle">Indicadores por unidade, sem ações operacionais.</p>
                </div>
                <Badge tone="amber">Read-only</Badge>
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
                      <td><Badge tone={unit.status === "ativa" ? "green" : "amber"}>{unit.status}</Badge></td>
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
            </Card>
          </>
        )}
      </div>
    </RoleGate>
  );
}
