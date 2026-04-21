import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { BarChart3, FileText, WalletCards } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader";
import RestrictedAreaNotice from "../../components/ui/RestrictedAreaNotice";
import { TabButton, Tabs } from "../../components/ui/Tabs";

const tabs = [
  { to: "dashboardFinanceiro", path: "dashboardFinanceiro", label: "Dashboard", icon: BarChart3 },
  { to: "contas-financeiras", path: "contas-financeiras", label: "Contas Financeiras", icon: WalletCards },
  { to: "plano-contas", path: "plano-contas", label: "Plano de Contas", icon: FileText },
];

export default function FinanceiroLayout() {
  const location = useLocation();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Módulo Financeiro"
        subtitle="Área crítica para receitas, despesas, saldo, contas e governança financeira."
      />

      <RestrictedAreaNotice
        title="Financeiro restrito"
        description="Este módulo concentra valores, saldos e indicadores sensíveis. A tela está preparada para integração futura com permissões reais por perfil."
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
  );
}
