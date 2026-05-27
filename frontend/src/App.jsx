import React from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import Layout from "./components/Layout";
import ToastProvider from "./components/ui/ToastProvider";
import { AuthProvider } from "./contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import AlunosPage from "./pages/alunos/AlunosPage";
import FormAlunoPage from "./pages/alunos/FormAlunoPage";
import PerfilPage from "./pages/alunos/PerfilPage";
import HistoricoAtividadesPage from "./pages/auditoria/HistoricoAtividadesPage";
import LoginPage from "./pages/auth/LoginPage";
import FinanceiroDashboard from "./pages/financeiro/FinanceiroDashboard";
import ContasFinanceirasPage from "./pages/financeiro/ContasFinanceirasPage";
import FinanceiroLayout from "./pages/financeiro/FinanceiroLayout";
import PlanoContasPage from "./pages/financeiro/PlanoContasPage";
import OnboardingTenantPage from "./pages/platform/OnboardingTenantPage";
import PlanoAssociadosPage from "./pages/planos/associacoes/PlanoAssociadosPage";
import PlanosPage from "./pages/planos/PlanosPage";
import ProdutosPage from "./pages/produtos/ProdutosPage";
import TenantOverviewPage from "./pages/tenant/TenantOverviewPage";
import UsuariosInternosPage from "./pages/usuarios/UsuariosInternosPage";
import VendasProdutosPage from "./pages/vendasProdutos/VendasProdutosPage";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />

              <Route path="/alunos" element={<AlunosPage />} />
              <Route path="/alunos/novo" element={<FormAlunoPage />} />
              <Route path="/alunos/editar/:id" element={<FormAlunoPage />} />
              <Route path="/alunos/:id" element={<PerfilPage />} />

              <Route path="/planos" element={<PlanosPage />} />
              <Route path="/produtos" element={<ProdutosPage />} />
              <Route path="/vendas-produtos" element={<VendasProdutosPage />} />
              <Route path="/planos/associacoes" element={<PlanoAssociadosPage />} />
              <Route path="/usuarios-internos" element={<UsuariosInternosPage />} />
              <Route path="/historico-atividades" element={<HistoricoAtividadesPage />} />
              <Route path="/tenant/overview" element={<TenantOverviewPage />} />
              <Route path="/platform/onboarding" element={<OnboardingTenantPage />} />

              <Route path="/financeiro" element={<FinanceiroLayout />}>
                <Route index element={<FinanceiroDashboard />} />
                <Route path="dashboardFinanceiro" element={<FinanceiroDashboard />} />
                <Route path="contas-financeiras" element={<ContasFinanceirasPage />} />
                <Route path="plano-contas" element={<PlanoContasPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
        <ToastProvider />
      </Router>
    </AuthProvider>
  );
}

export default App;
