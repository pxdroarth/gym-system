import { Link } from "react-router-dom";
import { ArrowRight, Building2, Radio, ShoppingCart, Wallet } from "lucide-react";
import Card from "../components/ui/Card";
import PageHeader from "../components/ui/PageHeader";
import useAuth from "../hooks/useAuth";
import { UI_PERMISSIONS, userHasUiPermission } from "../utils/permissions";

const reports = [
  { title: "Acessos", detail: "Histórico por aluno, data e resultado.", to: "/acessos", icon: Radio, permission: UI_PERMISSIONS.NAV_DASHBOARD },
  { title: "Vendas", detail: "Histórico de vendas e estornos da unidade.", to: "/vendas-produtos", icon: ShoppingCart, permission: UI_PERMISSIONS.NAV_VENDAS },
  { title: "Financeiro", detail: "Receitas, despesas e saldo por período.", to: "/financeiro/dashboardFinanceiro", icon: Wallet, permission: UI_PERMISSIONS.FINANCEIRO_VISUALIZAR },
  { title: "Consolidado da Rede", detail: "Indicadores das unidades autorizadas.", to: "/tenant/overview", icon: Building2, permission: UI_PERMISSIONS.TENANT_CONSOLIDADO_VISUALIZAR },
];

export default function RelatoriosPage() {
  const { user, currentUnit } = useAuth();
  return <div className="gym-module">
    <PageHeader title="Relatórios" subtitle={currentUnit?.nome} />
    <div className="gym-columns">
      {reports.filter((item) => userHasUiPermission(user, item.permission)).map(({ title, detail, to, icon: Icon }) =>
        <Card key={to} className="gym-panel">
          <Link className="gym-report-link" to={to}>
            <Icon size={24} /><span><strong>{title}</strong><small>{detail}</small></span><ArrowRight size={18} />
          </Link>
        </Card>
      )}
    </div>
  </div>;
}
