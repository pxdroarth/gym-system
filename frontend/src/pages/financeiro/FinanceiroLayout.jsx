import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { BarChart3, FileText, WalletCards } from "lucide-react";
import RoleGate from "../../components/auth/RoleGate";
import Card from "../../components/ui/Card";
import PageHeader from "../../components/ui/PageHeader";
import RestrictedAreaNotice from "../../components/ui/RestrictedAreaNotice";
import { TabButton, Tabs } from "../../components/ui/Tabs";
import { UI_PERMISSIONS } from "../../utils/permissions";

const tabs = [
  { to: "dashboardFinanceiro", path: "dashboardFinanceiro", label: "Dashboard", icon: BarChart3 },
  { to: "contas-financeiras", path: "contas-financeiras", label: "Contas Financeiras", icon: WalletCards },
  { to: "plano-contas", path: "plano-contas", label: "Plano de Contas", icon: FileText },
];

export default function FinanceiroLayout() {
  const location = useLocation();

  return (
    <RoleGate
      permission={UI_PERMISSIONS.FINANCEIRO_VISUALIZAR}
      fallback={(
        <div className="space-y-6">
          <PageHeader
            title="Financeiro restrito"
            subtitle="Esta área concentra valores, saldos e indicadores sensíveis."
          />
          <RestrictedAreaNotice
            title="Acesso visual não autorizado"
            description="Seu papel atual não possui permissão visual para acessar o módulo financeiro. A validação definitiva continua sendo feita pelo backend."
          />
        </div>
      )}
    >
      <div className="finance-shell">
        <Card className="finance-hero">
          <div className="finance-hero__content">
            <div>
              <div className="finance-hero__eyebrow">Área crítica por unidade</div>
              <h1 className="finance-hero__title">Financeiro isolado da operação comum, com leitura mais densa e restrita.</h1>
              <p className="finance-hero__copy">
                Este módulo permanece por unidade, sem consolidado operacional e sem vazamento de métricas monetárias para a dashboard geral. A autorização visual respeita o papel autenticado, enquanto o backend continua como fonte real de segurança.
              </p>
            </div>

            <div className="finance-hero__meta">
              <div className="finance-hero__meta-card">
                <div className="finance-hero__meta-label">Governança visual</div>
                <div className="finance-hero__meta-value">Restrita</div>
                <div className="finance-hero__meta-copy">Indicadores monetários e contas sensíveis ficam concentrados apenas aqui.</div>
              </div>
              <div className="finance-hero__meta-card">
                <div className="finance-hero__meta-label">Escopo</div>
                <div className="finance-hero__meta-value">Por unidade</div>
                <div className="finance-hero__meta-copy">A leitura acompanha a unidade ativa sem alterar contratos nem regras de domínio.</div>
              </div>
            </div>
          </div>
        </Card>

        <RestrictedAreaNotice
          title="Financeiro restrito"
          badgeLabel="Crítico"
          description="Este módulo concentra valores, saldos, pendências e contas. A interface reforça a sensibilidade da área e preserva a separação da dashboard operacional comum."
        />

        <Card className="finance-tabs-card">
          <Tabs>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = location.pathname.includes(tab.path);
              return (
                <TabButton key={tab.to} as={Link} active={active} to={tab.to}>
                  <span className="inline-flex items-center gap-2">
                    <Icon size={15} />
                    {tab.label}
                  </span>
                </TabButton>
              );
            })}
          </Tabs>
        </Card>

        <div className="animate-fadeIn min-h-[60vh]">
          <Outlet />
        </div>
      </div>
    </RoleGate>
  );
}
