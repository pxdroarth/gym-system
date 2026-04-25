import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { BarChart3, FileText, WalletCards } from "lucide-react";
import RoleGate from "../../components/auth/RoleGate";
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
      fallback={
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
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Módulo Financeiro"
          subtitle="Área crítica para receitas, despesas, saldo, contas e governança financeira."
        />

        <RestrictedAreaNotice
          title="Financeiro restrito"
          description="Este módulo concentra valores, saldos e indicadores sensíveis. A interface reflete o papel autenticado e mantém o backend como fonte de autorização real."
        />

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

        <div className="animate-fadeIn min-h-[60vh]">
          <Outlet />
        </div>
      </div>
    </RoleGate>
  );
}
