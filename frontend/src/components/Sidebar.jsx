import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Link2,
  Package,
  ShoppingCart,
  Users,
} from "lucide-react";

const menu = [
  { to: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { to: "/alunos", label: "Alunos", icon: Users },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/vendas-produtos", label: "Vendas", icon: ShoppingCart },
  { to: "/planos", label: "Planos", icon: CalendarDays },
  { to: "/planos/associacoes", label: "Associações", icon: Link2 },
  {
    label: "Financeiro",
    icon: CircleDollarSign,
    submenu: [
      { to: "/financeiro/dashboardFinanceiro", label: "Dashboard Financeiro" },
      { to: "/financeiro/contas-financeiras", label: "Contas Financeiras" },
      { to: "/financeiro/plano-contas", label: "Plano de Contas" },
    ],
  },
];

export default function Sidebar({ aberta = true }) {
  const [hovering, setHovering] = useState(false);
  const [open, setOpen] = useState({});
  const expanded = hovering || aberta;

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
        {menu.map((item) => {
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
        <div className="app-sidebar__avatar">SA</div>
        {expanded && (
          <div>
            <div className="app-sidebar__user-name">SA AGFIT</div>
            <div className="app-sidebar__user-role">Operação</div>
          </div>
        )}
      </div>
    </aside>
  );
}
