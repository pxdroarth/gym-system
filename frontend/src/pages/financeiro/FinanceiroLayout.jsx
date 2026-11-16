import React from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { BarChart3, FileText, RotateCcw, WalletCards } from "lucide-react";
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
  { to: "estornos-venda", path: "estornos-venda", label: "Estornos de venda", icon: RotateCcw },
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
            subtitle="Consulte um responsável para solicitar acesso."
          />
          <RestrictedAreaNotice
            title="Acesso restrito"
            description="O seu perfil não tem acesso ao módulo financeiro."
          />
        </div>
      )}
    >
      <div className="finance-shell">
        <Card className="finance-tabs-card">
          <Tabs>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = location.pathname.endsWith(tab.path) || (tab.path === "dashboardFinanceiro" && location.pathname === "/financeiro");
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
