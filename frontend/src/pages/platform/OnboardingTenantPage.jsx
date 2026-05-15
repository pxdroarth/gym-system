import React, { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Plus, Save, Settings2, Store, UserRound } from "lucide-react";
import { toast } from "react-toastify";
import RoleGate from "../../components/auth/RoleGate";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import KpiCard from "../../components/ui/KpiCard";
import Modal from "../../components/ui/Modal";
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
import getApiErrorMessage from "../../utils/getApiErrorMessage";
import { UI_PERMISSIONS } from "../../utils/permissions";

const tenantStatus = ["ativo", "inativo"];
const onboardingStatus = ["preparado", "operacional", "pendente_configuracao", "suspenso"];
const unitStatus = ["ativa", "inativa"];
const wizardSteps = ["Dados da Rede", "Unidade Matriz", "Responsavel Inicial", "Revisao"];

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

function formatStatus(status) {
  const labels = {
    ativo: "Ativo",
    inativo: "Inativo",
    preparada: "Preparada",
    preparado: "Preparado",
    operacional: "Operacional",
    pendente_configuracao: "Pendente de configuracao",
    suspenso: "Suspenso",
    ativa: "Ativa",
    inativa: "Inativa",
  };
  return labels[status] || status || "-";
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => Number(tenant.id) === Number(selectedTenantId)) || null,
    [tenants, selectedTenantId]
  );
  const matriz = useMemo(() => units.find((unit) => Number(unit.is_matriz) === 1) || units[0] || null, [units]);
  const redesAtivas = tenants.filter((tenant) => tenant.status === "ativo").length;

  async function carregarTenants(preferredId = selectedTenantId) {
    setLoading(true);
    try {
      const resposta = await listarTenants();
      const rows = resposta.data || [];
      setTenants(rows);
      const resolvedId = preferredId || rows[0]?.id || "";
      setSelectedTenantId(resolvedId ? String(resolvedId) : "");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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
      toast.error(getApiErrorMessage(error));
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

  function abrirNovaRede() {
    setOnboardingForm(initialOnboardingForm);
    setWizardStep(0);
    setWizardOpen(true);
  }

  function abrirConfiguracao(tenantId) {
    setSelectedTenantId(String(tenantId));
    setConfigOpen(true);
  }

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

  function validateWizardStep(step = wizardStep) {
    const requiredByStep = [
      ["tenant_nome"],
      ["unit_nome", "unit_codigo"],
      ["admin_nome", "admin_login", "admin_senha"],
      [],
    ];
    const missing = requiredByStep[step].some((field) => !String(onboardingForm[field] || "").trim());
    if (missing) {
      toast.warning("Preencha os campos obrigatorios antes de continuar.");
      return false;
    }
    return true;
  }

  function avancarWizard() {
    if (!validateWizardStep()) return;
    setWizardStep((prev) => Math.min(prev + 1, wizardSteps.length - 1));
  }

  async function handleCriarOnboarding() {
    if (!validateWizardStep(0) || !validateWizardStep(1) || !validateWizardStep(2)) return;

    setSavingCreate(true);
    try {
      const resposta = await criarTenantOnboarding(onboardingForm);
      toast.success("Rede criada com sucesso.");
      setOnboardingForm(initialOnboardingForm);
      setWizardOpen(false);
      setWizardStep(0);
      await carregarTenants(resposta.data?.tenant?.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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
      setConfigOpen(false);
      await carregarTenants(selectedTenant.id);
      await carregarUnits(selectedTenant.id);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSavingConfig(false);
    }
  }

  return (
    <RoleGate
      permission={UI_PERMISSIONS.PLATFORM_ONBOARDING_GERENCIAR}
      fallback={
        <EmptyState
          title="Area restrita a Administracao da Plataforma."
          description="O onboarding de redes e um fluxo interno da plataforma."
        />
      }
    >
      <div className="governance-shell">
        <PageHeader
          title="Onboarding da Rede"
          subtitle="Console interno para preparar redes, unidade matriz e responsavel inicial."
          actions={
            <Button onClick={abrirNovaRede}>
              <Plus size={16} />
              Nova Rede
            </Button>
          }
        />

        <RestrictedAreaNotice
          title="Acesso interno da plataforma"
          badgeLabel="Interno"
          tone="blue"
          description="Fluxo administrativo para criacao controlada de redes. Cobrança, período de teste e contratação pública não fazem parte desta área."
        />

        <div className="ui-status-grid">
          <KpiCard label="Redes" value={tenants.length} icon={<Building2 size={20} />} tone="blue" />
          <KpiCard label="Redes ativas" value={redesAtivas} icon={<CheckCircle2 size={20} />} tone="green" />
          <KpiCard label="Unidades da rede selecionada" value={units.length} icon={<Store size={20} />} tone="amber" />
        </div>

        <Card className="governance-table-card">
          <div className="governance-panel__body">
            <div className="ui-section-header">
              <div>
                <h2 className="ui-section-title">Redes cadastradas</h2>
                <p className="ui-section-subtitle">Acompanhe a preparacao das redes e ajuste a configuracao basica quando necessario.</p>
              </div>
              <Badge tone="gray">Administracao da Plataforma</Badge>
            </div>

            {loading ? (
              <EmptyState title="Carregando redes..." />
            ) : tenants.length === 0 ? (
              <EmptyState title="Nenhuma rede cadastrada." action={<Button onClick={abrirNovaRede}>Nova Rede</Button>} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th>Rede</th>
                    <th>Documento</th>
                    <th>Status</th>
                    <th>Plano</th>
                    <th>Etapa</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id}>
                      <td className="font-semibold">{tenant.nome}</td>
                      <td>{tenant.documento || "-"}</td>
                      <td><Badge tone={tenant.status === "ativo" ? "green" : "amber"}>{formatStatus(tenant.status)}</Badge></td>
                      <td>{tenant.plano_comercial || "-"}</td>
                      <td>
                        <Badge tone={tenant.onboarding_status === "operacional" ? "blue" : "gray"}>
                          {formatStatus(tenant.onboarding_status)}
                        </Badge>
                      </td>
                      <td>
                        <Button size="sm" variant="secondary" onClick={() => abrirConfiguracao(tenant.id)}>
                          <Settings2 size={14} />
                          Configurar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </Card>

        {wizardOpen && (
          <Modal title="Nova Rede" onClose={() => setWizardOpen(false)} className="ui-modal--xl">
            <div className="wizard-steps" aria-label="Etapas do onboarding">
              {wizardSteps.map((step, index) => (
                <div key={step} className={`wizard-step ${index === wizardStep ? "wizard-step--active" : ""}`}>
                  <span>{index + 1}</span>
                  {step}
                </div>
              ))}
            </div>

            <div className="wizard-panel">
              {wizardStep === 0 && (
                <div className="governance-form-grid governance-form-grid--triple">
                  <Input label="Nome da rede" name="tenant_nome" value={onboardingForm.tenant_nome} onChange={handleOnboardingChange} required />
                  <Input label="Documento" name="tenant_documento" value={onboardingForm.tenant_documento} onChange={handleOnboardingChange} />
                  <Input label="Plano comercial" name="plano_comercial" value={onboardingForm.plano_comercial} onChange={handleOnboardingChange} />
                  <Select label="Status da rede" name="tenant_status" value={onboardingForm.tenant_status} onChange={handleOnboardingChange}>
                    {tenantStatus.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                  </Select>
                  <Select label="Etapa" name="onboarding_status" value={onboardingForm.onboarding_status} onChange={handleOnboardingChange}>
                    {onboardingStatus.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                  </Select>
                </div>
              )}

              {wizardStep === 1 && (
                <div className="governance-form-grid governance-form-grid--triple">
                  <Input label="Unidade matriz" name="unit_nome" value={onboardingForm.unit_nome} onChange={handleOnboardingChange} required />
                  <Input label="Codigo da matriz" name="unit_codigo" value={onboardingForm.unit_codigo} onChange={handleOnboardingChange} required />
                  <Select label="Status da unidade" name="unit_status" value={onboardingForm.unit_status} onChange={handleOnboardingChange}>
                    {unitStatus.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                  </Select>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="governance-form-grid governance-form-grid--quad">
                  <Input label="Nome do responsavel" name="admin_nome" value={onboardingForm.admin_nome} onChange={handleOnboardingChange} required />
                  <Input label="Login" name="admin_login" value={onboardingForm.admin_login} onChange={handleOnboardingChange} required />
                  <Input label="Email" name="admin_email" type="email" value={onboardingForm.admin_email} onChange={handleOnboardingChange} />
                  <Input label="Senha inicial" name="admin_senha" type="password" value={onboardingForm.admin_senha} onChange={handleOnboardingChange} required />
                </div>
              )}

              {wizardStep === 3 && (
                <div className="governance-list">
                  <div className="governance-list__item">
                    <div>
                      <div className="governance-list__title">Rede</div>
                      <div className="governance-list__copy">{onboardingForm.tenant_nome || "-"}</div>
                    </div>
                    <div className="governance-list__value">{formatStatus(onboardingForm.tenant_status)}</div>
                  </div>
                  <div className="governance-list__item">
                    <div>
                      <div className="governance-list__title">Unidade Matriz</div>
                      <div className="governance-list__copy">{onboardingForm.unit_nome || "-"}</div>
                    </div>
                    <div className="governance-list__value">{onboardingForm.unit_codigo || "-"}</div>
                  </div>
                  <div className="governance-list__item">
                    <div>
                      <div className="governance-list__title">Responsavel inicial</div>
                      <div className="governance-list__copy">{onboardingForm.admin_nome || "-"}</div>
                    </div>
                    <div className="governance-list__value"><UserRound size={18} /></div>
                  </div>
                </div>
              )}
            </div>

            <div className="wizard-footer">
              <Button variant="ghost" onClick={() => (wizardStep === 0 ? setWizardOpen(false) : setWizardStep((prev) => prev - 1))}>
                {wizardStep === 0 ? "Cancelar" : "Voltar"}
              </Button>
              {wizardStep < wizardSteps.length - 1 ? (
                <Button onClick={avancarWizard}>Continuar</Button>
              ) : (
                <Button onClick={handleCriarOnboarding} disabled={savingCreate}>
                  {savingCreate ? "Criando..." : "Criar Rede"}
                </Button>
              )}
            </div>
          </Modal>
        )}

        {configOpen && (
          <Modal title="Configuracao da Rede" onClose={() => setConfigOpen(false)} className="ui-modal--xl">
            {loading ? (
              <EmptyState title="Carregando redes..." />
            ) : !selectedTenant ? (
              <EmptyState title="Nenhuma rede selecionada." />
            ) : (
              <form onSubmit={handleSalvarConfiguracao} className="space-y-4">
                <div className="governance-form-grid governance-form-grid--triple">
                  <Input label="Nome da rede" name="nome" value={tenantForm.nome} onChange={handleTenantChange} required />
                  <Input label="Documento" name="documento" value={tenantForm.documento} onChange={handleTenantChange} />
                  <Input label="Plano comercial" name="plano_comercial" value={tenantForm.plano_comercial} onChange={handleTenantChange} />
                  <Select label="Status" name="status" value={tenantForm.status} onChange={handleTenantChange}>
                    {tenantStatus.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                  </Select>
                  <Select label="Etapa" name="onboarding_status" value={tenantForm.onboarding_status} onChange={handleTenantChange}>
                    {onboardingStatus.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                  </Select>
                </div>

                <div className="governance-form-grid governance-form-grid--triple">
                  <Input label="Nome da matriz" name="nome" value={unitForm.nome} onChange={handleUnitChange} required />
                  <Input label="Codigo da matriz" name="codigo" value={unitForm.codigo} onChange={handleUnitChange} required />
                  <Select label="Status da matriz" name="status" value={unitForm.status} onChange={handleUnitChange}>
                    {unitStatus.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
                  </Select>
                </div>

                <div className="ui-info-item">
                  <div className="ui-info-item__label">Matriz</div>
                  <div className="ui-info-item__value text-sm">
                    A unidade matriz permanece definida pelo cadastro atual. Esta tela edita apenas os dados basicos da rede e da matriz.
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="ghost" onClick={() => setConfigOpen(false)} disabled={savingConfig}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={savingConfig || !matriz}>
                    <Save size={16} />
                    {savingConfig ? "Salvando..." : "Salvar configuracao"}
                  </Button>
                </div>
              </form>
            )}
          </Modal>
        )}
      </div>
    </RoleGate>
  );
}
