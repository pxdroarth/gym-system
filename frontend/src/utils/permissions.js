export const ROLES = Object.freeze({
  PLATFORM_ADMIN: "platform_admin",
  OWNER: "owner",
  ADMIN: "admin",
  GESTOR: "gestor",
  FINANCEIRO: "financeiro",
  RECEPCAO: "recepcao",
  OPERADOR_ACESSO: "operador_acesso",
});

export const UI_PERMISSIONS = Object.freeze({
  NAV_DASHBOARD: "nav:dashboard",
  NAV_ALUNOS: "nav:alunos",
  NAV_PRODUTOS: "nav:produtos",
  NAV_VENDAS: "nav:vendas",
  NAV_PLANOS: "nav:planos",
  NAV_ASSOCIACOES: "nav:associacoes",
  NAV_FINANCEIRO: "nav:financeiro",
  NAV_USUARIOS_INTERNOS: "nav:usuarios-internos",
  NAV_TENANT_OVERVIEW: "nav:tenant-overview",
  NAV_PLATFORM_ONBOARDING: "nav:platform-onboarding",
  NAV_HISTORICO_ATIVIDADES: "nav:historico-atividades",
  PLANOS_GERENCIAR: "planos:gerenciar",
  FINANCEIRO_VISUALIZAR: "financeiro:visualizar",
  TENANT_OVERVIEW_VISUALIZAR: "tenant-overview:visualizar",
  USUARIOS_INTERNOS_GERENCIAR: "usuarios-internos:gerenciar",
  PLATFORM_ONBOARDING_GERENCIAR: "platform-onboarding:gerenciar",
  HISTORICO_ATIVIDADES_VISUALIZAR: "historico-atividades:visualizar",
});

const ROLE_UI_PERMISSIONS = Object.freeze({
  [ROLES.PLATFORM_ADMIN]: Object.values(UI_PERMISSIONS),
  [ROLES.OWNER]: Object.values(UI_PERMISSIONS).filter((permission) => ![
    UI_PERMISSIONS.NAV_PLATFORM_ONBOARDING,
    UI_PERMISSIONS.PLATFORM_ONBOARDING_GERENCIAR,
  ].includes(permission)),
  [ROLES.ADMIN]: Object.values(UI_PERMISSIONS).filter((permission) => ![
    UI_PERMISSIONS.NAV_PLATFORM_ONBOARDING,
    UI_PERMISSIONS.PLATFORM_ONBOARDING_GERENCIAR,
  ].includes(permission)),
  [ROLES.GESTOR]: [
    UI_PERMISSIONS.NAV_DASHBOARD,
    UI_PERMISSIONS.NAV_ALUNOS,
    UI_PERMISSIONS.NAV_PRODUTOS,
    UI_PERMISSIONS.NAV_VENDAS,
    UI_PERMISSIONS.NAV_PLANOS,
    UI_PERMISSIONS.NAV_ASSOCIACOES,
  ],
  [ROLES.FINANCEIRO]: [
    UI_PERMISSIONS.NAV_DASHBOARD,
    UI_PERMISSIONS.NAV_FINANCEIRO,
    UI_PERMISSIONS.FINANCEIRO_VISUALIZAR,
  ],
  [ROLES.RECEPCAO]: [
    UI_PERMISSIONS.NAV_DASHBOARD,
    UI_PERMISSIONS.NAV_ALUNOS,
    UI_PERMISSIONS.NAV_PRODUTOS,
    UI_PERMISSIONS.NAV_VENDAS,
    UI_PERMISSIONS.NAV_PLANOS,
    UI_PERMISSIONS.NAV_ASSOCIACOES,
  ],
  [ROLES.OPERADOR_ACESSO]: [
    UI_PERMISSIONS.NAV_DASHBOARD,
    UI_PERMISSIONS.NAV_ALUNOS,
  ],
});

export function roleHasUiPermission(role, permission) {
  return (ROLE_UI_PERMISSIONS[role] || []).includes(permission);
}

export function userHasUiPermission(user, permission) {
  return roleHasUiPermission(user?.papel, permission);
}

export function getRoleLabel(role) {
  const labels = {
    [ROLES.PLATFORM_ADMIN]: "Admin Plataforma",
    [ROLES.OWNER]: "Owner",
    [ROLES.ADMIN]: "Administrador",
    [ROLES.GESTOR]: "Gestor",
    [ROLES.FINANCEIRO]: "Financeiro",
    [ROLES.RECEPCAO]: "Recepção",
    [ROLES.OPERADOR_ACESSO]: "Operador de Acesso",
  };
  return labels[role] || "Operador";
}
