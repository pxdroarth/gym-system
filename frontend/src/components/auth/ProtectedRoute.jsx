import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import Card from "../ui/Card";

export default function ProtectedRoute() {
  const { loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-page)] p-6">
        <Card className="p-6 text-center max-w-sm w-full">
          <div className="font-extrabold text-slate-900">Carregando sessão...</div>
          <div className="text-sm text-slate-500 mt-2">Validando operador autenticado.</div>
        </Card>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
