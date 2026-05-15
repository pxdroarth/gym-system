import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LockKeyhole } from "lucide-react";
import { toast } from "react-toastify";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import useAuth from "../../hooks/useAuth";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const [form, setForm] = useState({ login: "", senha: "" });
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || "/dashboard";

  if (!loading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.login || !form.senha) {
      toast.error("Informe login e senha.");
      return;
    }

    try {
      setSubmitting(true);
      await login(form);
      toast.success("Login realizado com sucesso.");
      navigate(from, { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--surface-page)] flex items-center justify-center p-6">
      <Card className="w-full max-w-md overflow-hidden">
        <div className="p-6 border-b bg-white">
          <div className="w-12 h-12 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
            <LockKeyhole size={24} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 m-0">Academia SA</h1>
          <p className="text-sm text-slate-500 mt-2 mb-0">
            Acesse o painel de gestão com seu usuário interno.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input
            label="Login ou email"
            value={form.login}
            onChange={(e) => setForm((prev) => ({ ...prev, login: e.target.value }))}
            autoComplete="username"
          />
          <Input
            label="Senha"
            type="password"
            value={form.senha}
            onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))}
            autoComplete="current-password"
          />
          <Button type="submit" className="w-full" disabled={submitting || loading}>
            {submitting ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
