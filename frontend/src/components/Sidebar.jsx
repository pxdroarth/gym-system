import { NavLink } from "react-router-dom";
import { useState } from "react";

const menu = [
  { to: "/dashboard", label: "Dashboard", icon: "📊" },
  { to: "/alunos", label: "Alunos", icon: "👤" },
  { to: "/produtos", label: "Produtos", icon: "🛒" },
  { to: "/vendas-produtos", label: "Vendas", icon: "💰" },
  { to: "/planos", label: "Planos", icon: "📅" },                // ✅ Novo
  { to: "/planos/associacoes", label: "Associações", icon: "👥" }, // ✅ Novo
  {
    label: "Financeiro",
    icon: "💸",
    submenu: [
      { to: "/financeiro/dashboardFinanceiro", label: "Dashboard Financeiro" },
      { to: "/financeiro/contas-financeiras", label: "Contas Financeiras" },
      { to: "/financeiro/plano-contas", label: "Plano de Contas" },
    ],
    to: "/financeiro/dashboard" // permite clique direto para dashboard
  }
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
      className={`transition-all duration-300 h-screen fixed top-0 left-0 bg-white shadow-lg border-r 
        ${expanded ? "w-64" : "w-16"} 
        flex flex-col z-50`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="h-16 flex items-center justify-center font-bold text-blue-700 text-lg border-b">
        {expanded ? "Academia SA" : "🏋️"}
      </div>

      <nav className="flex-grow px-2 py-4 space-y-1 overflow-y-auto">
        {menu.map((item) =>
          item.submenu ? (
            <div key={item.label}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-md font-medium cursor-pointer transition-colors duration-200 ${
                  open[item.label] ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-100"
                }`}
                onClick={() => expanded && handleToggle(item.label)}
                tabIndex={0}
              >
                <span className="text-xl">{item.icon}</span>
                {expanded && (
                  <>
                    <span>{item.label}</span>
                    <span className="ml-auto text-sm">
                      {open[item.label] ? "▼" : "▶"}
                    </span>
                  </>
                )}
              </div>
              {expanded && open[item.label] && (
                <div className="ml-6 flex flex-col gap-1">
                  {item.submenu.map((sub) => (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      className={({ isActive }) =>
                        `flex items-center gap-2 px-2 py-1 rounded font-normal text-sm transition-colors duration-150 ${
                          isActive
                            ? "bg-blue-100 text-blue-700"
                            : "text-gray-700 hover:bg-gray-100"
                        }`
                      }
                    >
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md font-medium transition-colors duration-200 ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`
              }
            >
              <span className="text-xl">{item.icon}</span>
              {expanded && <span>{item.label}</span>}
            </NavLink>
          )
        )}
      </nav>
    </aside>
  );
}
