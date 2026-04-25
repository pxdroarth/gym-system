import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Link2,
  Package,
  ShoppingCart,
  Settings2,
  UserCog,
  Users,
} from "lucide-react";
import useAuth from "../hooks/useAuth";
import { getRoleLabel, UI_PERMISSIONS, userHasUiPermission } from "../utils/permissions";

const menu = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, permission: UI_PERMISSIONS.NAV_DASHBOARD },
  { to: "/tenant/overview", label: "Consolidado", icon: Building2, permission: UI_PERMISSIONS.NAV_TENANT_OVERVIEW },
  { to: "/platform/onboarding", label: "Onboarding", icon: Settings2, permission: UI_PERMISSIONS.NAV_PLATFORM_ONBOARDING },
  { to: "/alunos", label: "Alunos", icon: Users, permission: UI_PERMISSIONS.NAV_ALUNOS },
  { to: "/produtos", label: "Produtos", icon: Package, permission: UI_PERMISSIONS.NAV_PRODUTOS },
  { to: "/vendas-produtos", label: "Vendas", icon: ShoppingCart, permission: UI_PERMISSIONS.NAV_VENDAS },
  { to: "/planos", label: "Planos", icon: CalendarDays, permission: UI_PERMISSIONS.NAV_PLANOS },
  { to: "/planos/associacoes", label: "Associações", icon: Link2, permission: UI_PERMISSIONS.NAV_ASSOCIACOES },
  { to: "/usuarios-internos", label: "Usuários", icon: UserCog, permission: UI_PERMISSIONS.NAV_USUARIOS_INTERNOS },
  {
    label: "Financeiro",
    icon: CircleDollarSign,
    permission: UI_PERMISSIONS.NAV_FINANCEIRO,
    submenu: [
      { to: "/financeiro/dashboardFinanceiro", label: "Dashboard Financeiro" },
      { to: "/financeiro/contas-financeiras", label: "Contas Financeiras" },
      { to: "/financeiro/plano-contas", label: "Plano de Contas" },
    ],
  },
];

function initials(name) {
  return String(name || "SA")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function Sidebar({ aberta = true }) {
  const [hovering, setHovering] = useState(false);
  const [open, setOpen] = useState({});
  const { user } = useAuth();
  const expanded = hovering || aberta;
  const visibleMenu = menu.filter((item) => userHasUiPermission(user, item.permission));

  const handleToggle = (label) => {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside
      className={`app-sidebar ${expanded ? "" : "app-sidebar--collapsed"}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="app-sidebar__brand">
        <div className="app-sidebar__mark">SA</div>
        {expanded && (
          <div>
            <div className="app-sidebar__title">Academia SA</div>
            <div className="app-sidebar__subtitle">Gestão Inteligente</div>
          </div>
        )}
      </div>

      <nav className="app-sidebar__nav">
        {visibleMenu.map((item) => {
          const Icon = item.icon;

          if (item.submenu) {
            return (
              <div key={item.label}>
                <button
                  type="button"
                  className="app-sidebar__submenu-trigger"
                  onClick={() => expanded && handleToggle(item.label)}
                  aria-expanded={Boolean(open[item.label])}
                >
                  <span className="app-sidebar__icon">
                    <Icon size={18} />
                  </span>
                  {expanded && (
                    <>
                      <span className="app-sidebar__label">{item.label}</span>
                      <span className="app-sidebar__chevron">
                        {open[item.label] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </span>
                    </>
                  )}
                </button>

                {expanded && open[item.label] && (
                  <div className="app-sidebar__submenu">
                    {item.submenu.map((sub) => (
                      <NavLink
                        key={sub.to}
                        to={sub.to}
                        className={({ isActive }) => `app-sidebar__subitem ${isActive ? "active" : ""}`}
                      >
                        {sub.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `app-sidebar__item ${isActive ? "active" : ""}`}
            >
              <span className="app-sidebar__icon">
                <Icon size={18} />
              </span>
              {expanded && <span className="app-sidebar__label">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="app-sidebar__user">
        <div className="app-sidebar__avatar">{initials(user?.nome || user?.login)}</div>
        {expanded && (
          <div>
            <div className="app-sidebar__user-name">{user?.nome || user?.login || "Operador"}</div>
            <div className="app-sidebar__user-role">{getRoleLabel(user?.papel)}</div>
          </div>
        )}
      </div>
    </aside>
  );
}
