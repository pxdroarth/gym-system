import React, { useEffect, useMemo, useState } from "react";
import { Building2, Save, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import KpiCard from "../../components/ui/KpiCard";
import PageHeader from "../../components/ui/PageHeader";
import RestrictedAreaNotice from "../../components/ui/RestrictedAreaNotice";
import Select from "../../components/ui/Select";
import Table from "../../components/ui/Table";
import { criarTenantOnboarding } from "../../services/onboardingService";
import {
  atualizarTenant,
  atualizarUnit,
  listarTenants,
  listarUnitsPorTenant,
} from "../../services/tenantService";
import { UI_PERMISSIONS } from "../../utils/permissions";

const tenantStatus = ["ativo", "inativo"];
const onboardingStatus = ["preparado", "operacional", "pendente_configuracao", "suspenso"];
const unitStatus = ["ativa", "inativa"];

const initialOnboardingForm = {
  tenant_nome: "",
  tenant_documento: "",
  tenant_status: "ativo",
  plano_comercial: "",
  onboarding_status: "preparado",
  unit_nome: "Unidade Matriz",
  unit_codigo: "matriz",
  unit_status: "ativa",
  admin_nome: "",
  admin_email: "",
  admin_login: "",
  admin_senha: "",
};

function normalizeTenantForm(tenant) {
  return {
    nome: tenant?.nome || "",
    documento: tenant?.documento || "",
    status: tenant?.status || "ativo",
    plano_comercial: tenant?.plano_comercial || "",
    onboarding_status: tenant?.onboarding_status || "operacional",
  };
}

function normalizeUnitForm(unit) {
  return {
    nome: unit?.nome || "",
    codigo: unit?.codigo || "",
    status: unit?.status || "ativa",
  };
}

export default function OnboardingTenantPage() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [units, setUnits] = useState([]);
  const [onboardingForm, setOnboardingForm] = useState(initialOnboardingForm);
  const [tenantForm, setTenantForm] = useState(normalizeTenantForm(null));
  const [unitForm, setUnitForm] = useState(normalizeUnitForm(null));
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => Number(tenant.id) === Number(selectedTenantId)) || null,
    [tenants, selectedTenantId]
  );
  const matriz = useMemo(() => units.find((unit) => Number(unit.is_matriz) === 1) || units[0] || null, [units]);

  async function carregarTenants(preferredId = selectedTenantId) {
    setLoading(true);
    try {
      const resposta = await listarTenants();
      const rows = resposta.data || [];
      setTenants(rows);
      const resolvedId = preferredId || rows[0]?.id || "";
      setSelectedTenantId(resolvedId ? String(resolvedId) : "");
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao carregar tenants.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarUnits(tenantId) {
    if (!tenantId) {
      setUnits([]);
      return;
    }
    try {
      const resposta = await listarUnitsPorTenant(tenantId);
      setUnits(resposta.data || []);
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao carregar unidades.");
    }
  }

  useEffect(() => {
    carregarTenants();
  }, []);

  useEffect(() => {
    setTenantForm(normalizeTenantForm(selectedTenant));
    carregarUnits(selectedTenantId);
  }, [selectedTenantId, selectedTenant]);

  useEffect(() => {
    setUnitForm(normalizeUnitForm(matriz));
  }, [matriz]);

  function handleOnboardingChange(event) {
    const { name, value } = event.target;
    setOnboardingForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleTenantChange(event) {
    const { name, value } = event.target;
    setTenantForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleUnitChange(event) {
    const { name, value } = event.target;
    setUnitForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCriarOnboarding(event) {
    event.preventDefault();
    setSavingCreate(true);
    try {
      const resposta = await criarTenantOnboarding(onboardingForm);
      toast.success("Onboarding interno criado com sucesso.");
      setOnboardingForm(initialOnboardingForm);
      await carregarTenants(resposta.data?.tenant?.id);
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao criar onboarding interno.");
    } finally {
      setSavingCreate(false);
    }
  }

  async function handleSalvarConfiguracao(event) {
    event.preventDefault();
    if (!selectedTenant || !matriz) return;

    setSavingConfig(true);
    try {
      await atualizarTenant(selectedTenant.id, tenantForm);
      await atualizarUnit(matriz.id, unitForm);
      toast.success("Configuracao basica atualizada.");
      await carregarTenants(selectedTenant.id);
      await carregarUnits(selectedTenant.id);
    } catch (error) {
      toast.error(error?.response?.data?.error || error.message || "Erro ao salvar configuracao.");
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <RoleGate permission={UI_PERMISSIONS.PLATFORM_ONBOARDING_GERENCIAR} fallback={<EmptyState title="Area restrita a platform_admin." />}>
      <div className="space-y-6">
        <PageHeader
          title="Onboarding Interno"
          subtitle="Preparacao controlada de tenant, unidade matriz e owner inicial."
        />

        <RestrictedAreaNotice
          title="Administracao de plataforma"
          badgeLabel="Interno"
          description="Este fluxo nao e self-service publico. Billing, trial e checkout continuam fora desta sprint."
        />

        <div className="ui-status-grid">
          <KpiCard label="Tenants" value={tenants.length} icon={<Building2 size={20} />} tone="blue" />
          <KpiCard label="Selecionado" value={selectedTenant?.nome || "-"} icon={<ShieldCheck size={20} />} tone="amber" />
        </div>

        <Card>
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Novo tenant</h2>
              <p className="ui-section-subtitle">Cria tenant, matriz e owner inicial em uma transacao auditada.</p>
            </div>
            <Badge tone="amber">platform_admin</Badge>
          </div>

          <form onSubmit={handleCriarOnboarding} className="space-y-4">
            <div className="grid md:grid-cols-3 gap-4">
              <Input label="Nome do tenant" name="tenant_nome" value={onboardingForm.tenant_nome} onChange={handleOnboardingChange} required />
              <Input label="Documento" name="tenant_documento" value={onboardingForm.tenant_documento} onChange={handleOnboardingChange} />
              <Input label="Plano comercial" name="plano_comercial" value={onboardingForm.plano_comercial} onChange={handleOnboardingChange} />
              <Select label="Status tenant" name="tenant_status" value={onboardingForm.tenant_status} onChange={handleOnboardingChange}>
                {tenantStatus.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
              <Select label="Onboarding" name="onboarding_status" value={onboardingForm.onboarding_status} onChange={handleOnboardingChange}>
                {onboardingStatus.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Input label="Unidade matriz" name="unit_nome" value={onboardingForm.unit_nome} onChange={handleOnboardingChange} required />
              <Input label="Codigo da matriz" name="unit_codigo" value={onboardingForm.unit_codigo} onChange={handleOnboardingChange} required />
              <Select label="Status unidade" name="unit_status" value={onboardingForm.unit_status} onChange={handleOnboardingChange}>
                {unitStatus.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </div>

            <div className="grid md:grid-cols-4 gap-4">
              <Input label="Nome do owner" name="admin_nome" value={onboardingForm.admin_nome} onChange={handleOnboardingChange} required />
              <Input label="Login owner" name="admin_login" value={onboardingForm.admin_login} onChange={handleOnboardingChange} required />
              <Input label="Email owner" name="admin_email" type="email" value={onboardingForm.admin_email} onChange={handleOnboardingChange} />
              <Input label="Senha inicial" name="admin_senha" type="password" value={onboardingForm.admin_senha} onChange={handleOnboardingChange} required />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={savingCreate}>
                {savingCreate ? "Criando..." : "Criar onboarding"}
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Configuracao basica</h2>
              <p className="ui-section-subtitle">Ajuste controlado do tenant e da unidade matriz inicial.</p>
            </div>
            <Select value={selectedTenantId} onChange={(event) => setSelectedTenantId(event.target.value)}>
              <option value="">Selecionar tenant</option>
              {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.nome}</option>)}
            </Select>
          </div>

          {loading ? (
            <EmptyState title="Carregando tenants..." />
          ) : !selectedTenant ? (
            <EmptyState title="Nenhum tenant selecionado." />
          ) : (
            <form onSubmit={handleSalvarConfiguracao} className="space-y-4">
              <div className="grid md:grid-cols-3 gap-4">
                <Input label="Nome" name="nome" value={tenantForm.nome} onChange={handleTenantChange} required />
                <Input label="Documento" name="documento" value={tenantForm.documento} onChange={handleTenantChange} />
                <Input label="Plano comercial" name="plano_comercial" value={tenantForm.plano_comercial} onChange={handleTenantChange} />
                <Select label="Status" name="status" value={tenantForm.status} onChange={handleTenantChange}>
                  {tenantStatus.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
                <Select label="Onboarding" name="onboarding_status" value={tenantForm.onboarding_status} onChange={handleTenantChange}>
                  {onboardingStatus.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <Input label="Nome da matriz" name="nome" value={unitForm.nome} onChange={handleUnitChange} required />
                <Input label="Codigo da matriz" name="codigo" value={unitForm.codigo} onChange={handleUnitChange} required />
                <Select label="Status matriz" name="status" value={unitForm.status} onChange={handleUnitChange}>
                  {unitStatus.map((status) => <option key={status} value={status}>{status}</option>)}
                </Select>
              </div>

              <div className="ui-info-item">
                <div className="ui-info-item__label">Matriz</div>
                <div className="ui-info-item__value text-sm">
                  is_matriz permanece somente leitura nesta sprint. A unidade selecionada para configuracao e {matriz?.nome || "-"}.
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={savingConfig || !matriz}>
                  <Save size={16} />
                  {savingConfig ? "Salvando..." : "Salvar configuracao"}
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card>
          <div className="ui-section-header">
            <div>
              <h2 className="ui-section-title">Tenants cadastrados</h2>
              <p className="ui-section-subtitle">Lista operacional para acompanhamento interno.</p>
            </div>
          </div>
          <Table>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>Documento</th>
                <th>Status</th>
                <th>Plano</th>
                <th>Onboarding</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td className="font-semibold">{tenant.nome}</td>
                  <td>{tenant.documento || "-"}</td>
                  <td><Badge tone={tenant.status === "ativo" ? "green" : "amber"}>{tenant.status}</Badge></td>
                  <td>{tenant.plano_comercial || "-"}</td>
                  <td>{tenant.onboarding_status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </RoleGate>
  );
}
