const USER_ROLES = Object.freeze({
  PLATFORM_ADMIN: 'platform_admin',
  OWNER: 'owner',
  ADMIN: 'admin',
  GESTOR: 'gestor',
  FINANCEIRO: 'financeiro',
  RECEPCAO: 'recepcao',
  OPERADOR_ACESSO: 'operador_acesso',
});

const USER_STATUS = Object.freeze({
  ATIVO: 'ativo',
  INATIVO: 'inativo',
  BLOQUEADO: 'bloqueado',
});

const PERMISSIONS = Object.freeze({
  USUARIOS_CRIAR: 'usuarios:criar',
  USUARIOS_ALTERAR_PAPEL: 'usuarios:alterar_papel',
  USUARIOS_ALTERAR_STATUS: 'usuarios:alterar_status',
  FECHAMENTO_FECHAR: 'fechamento:fechar',
  FECHAMENTO_REABRIR: 'fechamento:reabrir',
  FINANCEIRO_SINCRONIZAR: 'financeiro:sincronizar',
  PAGAMENTOS_REGISTRAR: 'pagamentos:registrar',
  REVERSAO_EXECUTAR: 'reversao:executar',
  ACESSO_LIBERACAO_MANUAL: 'acesso:liberacao_manual',
  PLANOS_GERENCIAR: 'planos:gerenciar',
  ALUNOS_ALTERAR_PLANO_COM_DEPENDENTES: 'alunos:alterar_plano_com_dependentes',
  LOGS_VISUALIZAR_TOTAL: 'logs:visualizar_total',
  LOGS_VISUALIZAR_ESCOPO: 'logs:visualizar_escopo',
  TENANT_CONSOLIDADO_VISUALIZAR: 'tenant:consolidado_visualizar',
  PLATFORM_ONBOARDING_EXECUTAR: 'platform:onboarding_executar',
  PLATFORM_TENANT_CONFIGURAR: 'platform:tenant_configurar',
});

const PLATFORM_ONLY_PERMISSIONS = [
  PERMISSIONS.LOGS_VISUALIZAR_TOTAL,
  PERMISSIONS.PLATFORM_ONBOARDING_EXECUTAR,
  PERMISSIONS.PLATFORM_TENANT_CONFIGURAR,
];

const ACADEMIA_ADMIN_PERMISSIONS = Object.values(PERMISSIONS).filter(
  (permission) => !PLATFORM_ONLY_PERMISSIONS.includes(permission)
);

const ROLE_PERMISSIONS = Object.freeze({
  [USER_ROLES.PLATFORM_ADMIN]: Object.values(PERMISSIONS),
  [USER_ROLES.OWNER]: ACADEMIA_ADMIN_PERMISSIONS,
  [USER_ROLES.ADMIN]: ACADEMIA_ADMIN_PERMISSIONS,
  [USER_ROLES.GESTOR]: [
    PERMISSIONS.ALUNOS_ALTERAR_PLANO_COM_DEPENDENTES,
  ],
  [USER_ROLES.FINANCEIRO]: [
    PERMISSIONS.REVERSAO_EXECUTAR,
  ],
  [USER_ROLES.RECEPCAO]: [],
  [USER_ROLES.OPERADOR_ACESSO]: [
    PERMISSIONS.ACESSO_LIBERACAO_MANUAL,
  ],
});

function isValidRole(role) {
  return Object.values(USER_ROLES).includes(role);
}

function isValidStatus(status) {
  return Object.values(USER_STATUS).includes(status);
}

function roleHasPermission(role, permission) {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

module.exports = {
  USER_ROLES,
  USER_ROLE_VALUES: Object.values(USER_ROLES),
  USER_STATUS,
  USER_STATUS_VALUES: Object.values(USER_STATUS),
  PERMISSIONS,
  ROLE_PERMISSIONS,
  isValidRole,
  isValidStatus,
  roleHasPermission,
};
