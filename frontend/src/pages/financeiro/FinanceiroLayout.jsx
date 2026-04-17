import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";

export default function FinanceiroLayout() {
  const location = useLocation();

  const isActive = (path) =>
    location.pathname.includes(path) ? "bg-blue-600 text-white" : "bg-gray-200";

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-6 text-blue-700">Módulo Financeiro</h1>

      {/* Navegação interna do módulo */}
      <div className="flex gap-3 mb-6">
        <Link
          to="dashboardFinanceiro"
          className={`px-4 py-2 rounded font-medium ${isActive("dashboard")}`}
        >
          Dashboard
        </Link>
        <Link
          to="contas-financeiras"
          className={`px-4 py-2 rounded font-medium ${isActive("contas-financeiras")}`}
        >
          Contas Financeiras
        </Link>
        <Link
          to="plano-contas"
          className={`px-4 py-2 rounded font-medium ${isActive("plano-contas")}`}
        >
          Plano de Contas
        </Link>
        {/* Adicione mais links aqui futuramente como Relatórios, Consolidação etc */}
      </div>

      {/* Área onde será renderizado o conteúdo da subrota */}
      <div className="bg-white p-4 rounded shadow animate-fadeIn min-h-[60vh]">
        <Outlet />
      </div>
    </div>
  );
}
