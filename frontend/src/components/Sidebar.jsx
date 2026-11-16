import { useEffect, useRef, useState } from "react";
import gymLogo from "../assets/previa/gym.png";
import { NavLink, useLocation } from "react-router-dom";
import {
  House,
  Radio,
  FileText,
  ChevronsLeft,
  ChevronsRight,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileClock,
  Link2,
  Package,
  Settings2,
  ShoppingCart,
  UserCog,
  Users,
  X,
} from "lucide-react";
import useAuth from "../hooks/useAuth";
import { UI_PERMISSIONS, userHasUiPermission } from "../utils/permissions";

export const menu = [
  { to: "/dashboard", label: "Dashboard", icon: House, permission: UI_PERMISSIONS.NAV_DASHBOARD },
  { to: "/alunos", label: "Alunos", icon: Users, permission: UI_PERMISSIONS.NAV_ALUNOS },
  { to: "/produtos", label: "Produtos", icon: Package, permission: UI_PERMISSIONS.NAV_PRODUTOS },
  { to: "/vendas-produtos", label: "Vendas", icon: ShoppingCart, permission: UI_PERMISSIONS.NAV_VENDAS },
  { to: "/planos", label: "Planos", icon: CalendarDays, permission: UI_PERMISSIONS.NAV_PLANOS },
  { to: "/planos/associacoes", label: "Associações", icon: Link2, permission: UI_PERMISSIONS.NAV_ASSOCIACOES },
  {
    label: "Financeiro",
    icon: CircleDollarSign,
    permission: UI_PERMISSIONS.NAV_FINANCEIRO,
    submenu: [
      { to: "/financeiro/dashboardFinanceiro", label: "Dashboard Financeiro" },
      { to: "/financeiro/contas-financeiras", label: "Contas Financeiras" },
      { to: "/financeiro/plano-contas", label: "Plano de Contas" },
      { to: "/financeiro/estornos-venda", label: "Estornos de venda" },
    ],
  },
  { to: "/acessos", label: "Acessos", icon: Radio, permission: UI_PERMISSIONS.NAV_DASHBOARD },
  { to: "/relatorios", label: "Relatórios", icon: FileText, permission: UI_PERMISSIONS.NAV_DASHBOARD },
  { to: "/tenant/overview", label: "Consolidado", icon: Building2, permission: UI_PERMISSIONS.NAV_TENANT_OVERVIEW },
  { to: "/usuarios-internos", label: "Usuários", icon: UserCog, permission: UI_PERMISSIONS.USUARIOS_VISUALIZAR },
  { to: "/historico-atividades", label: "Histórico", icon: FileClock, permission: UI_PERMISSIONS.NAV_HISTORICO_ATIVIDADES },
  { to: "/platform/onboarding", label: "Onboarding", icon: Settings2, permission: UI_PERMISSIONS.NAV_PLATFORM_ONBOARDING },
];

// compacto: abaixo de 1024 px o menu vira gaveta (mesmos links, submenu abre dentro).
export default function Sidebar({ aberta = true, compacto = false, gavetaAberta = false, onFechar, onAlternar }) {
  const [hovering, setHovering] = useState(false);
  const location = useLocation();
  const [open, setOpen] = useState(() => (
    location.pathname.startsWith("/financeiro") ? { Financeiro: true } : {}
  ));
  const asideRef = useRef(null);
  const { user } = useAuth();
  const expanded = compacto || hovering || aberta;
  const visibleMenu = menu.filter((item) => userHasUiPermission(user, item.permission));

  // Ao abrir a gaveta, o foco vai para o primeiro link.
  useEffect(() => {
    if (compacto && gavetaAberta) {
      asideRef.current?.querySelector(".app-sidebar__nav a, .app-sidebar__nav button")?.focus();
    }
  }, [compacto, gavetaAberta]);

  const handleToggle = (label) => {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside
      id="app-sidebar"
      ref={asideRef}
      aria-label="Menu principal"
      className={[
        "app-sidebar",
        expanded ? "" : "app-sidebar--collapsed",
        compacto ? "app-sidebar--drawer" : "",
        compacto && gavetaAberta ? "is-open" : "",
      ].filter(Boolean).join(" ")}
      onMouseEnter={() => !compacto && setHovering(true)}
      onMouseLeave={() => !compacto && setHovering(false)}
    >
      <div className="app-sidebar__brand">
        <NavLink to="/dashboard" aria-label="Gym System"><img className="app-sidebar__mark" src={gymLogo} alt="" /></NavLink>
        {expanded && (
          <div className="app-sidebar__brand-text">
            <div className="app-sidebar__title">Gym System</div>
            <div className="app-sidebar__subtitle">Gestão de Academias</div>
          </div>
        )}
        {compacto && (
          <button type="button" className="app-sidebar__close" onClick={onFechar} aria-label="Fechar menu">
            <X size={20} aria-hidden="true" />
          </button>
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
                  className={`app-sidebar__submenu-trigger ${location.pathname.startsWith("/financeiro") ? "active" : ""}`}
                  onClick={() => expanded && handleToggle(item.label)}
                  aria-expanded={Boolean(open[item.label])}
                  aria-controls={`submenu-${item.label}`}
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
                  <div className="app-sidebar__submenu" id={`submenu-${item.label}`}>
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

      {!compacto && (
        <button type="button" className="app-sidebar__collapse" onClick={onAlternar}
          aria-label={aberta ? "Recolher menu lateral" : "Expandir menu lateral"}>
          {aberta ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
          {aberta && <span>Recolher menu</span>}
        </button>
      )}
    </aside>
  );
}
