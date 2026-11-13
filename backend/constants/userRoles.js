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
  USUARIOS_VISUALIZAR: 'usuarios:visualizar',
  USUARIOS_CRIAR: 'usuarios:criar',
  USUARIOS_ALTERAR_PAPEL: 'usuarios:alterar_papel',
  USUARIOS_ALTERAR_STATUS: 'usuarios:alterar_status',
  USUARIOS_ALTERAR_UNIDADES: 'usuarios:alterar_unidades',
  FECHAMENTO_FECHAR: 'fechamento:fechar',
  FECHAMENTO_REABRIR: 'fechamento:reabrir',
  // Acesso ao modulo Financeiro (dashboard, contas, plano de contas, ativos,
  // orcamento e fechamento). Mesma regra do frontend (NAV_FINANCEIRO):
  // platform_admin, owner, admin e financeiro.
  FINANCEIRO_ACESSAR: 'financeiro:acessar',
  FINANCEIRO_SINCRONIZAR: 'financeiro:sincronizar',
  ALUNOS_ALTERAR_STATUS_VENCIMENTO: 'alunos:alterar_status_vencimento',
  ALUNOS_EDITAR: 'alunos:editar',
  MENSALIDADES_EMITIR_PADRAO: 'mensalidades:emitir_padrao',
  MENSALIDADES_DESCONTO: 'mensalidades:desconto',
  MENSALIDADES_GERENCIAR: 'mensalidades:gerenciar',
  PLANO_CONTAS_GERENCIAR_REDE: 'plano_contas:gerenciar_rede',
  RELATORIOS_REDE_INTEGRAL: 'relatorios:rede_integral',
  PAGAMENTOS_REGISTRAR: 'pagamentos:registrar',
  VENDAS_REGISTRAR: 'vendas:registrar',
  PRODUTOS_GERENCIAR: 'produtos:gerenciar',
  REVERSAO_EXECUTAR: 'reversao:executar',
  // Estorno de venda (L04, DN-3). Cada etapa tem permissao propria, ligada ao
  // papel e validada na unidade do escopo: solicitar (recepcao, gestor,
  // financeiro, admin, dono), aprovar no sistema (gestor, admin, dono),
  // registrar autorizacao externa por WhatsApp ou e-mail (recepcao,
  // financeiro, admin, dono) e executar (recepcao, financeiro, admin, dono).
  VENDAS_ESTORNO_SOLICITAR: 'vendas:estorno_solicitar',
  VENDAS_ESTORNO_APROVAR: 'vendas:estorno_aprovar',
  VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO: 'vendas:estorno_registrar_autorizacao',
  VENDAS_ESTORNO_EXECUTAR: 'vendas:estorno_executar',
  ACESSO_LIBERACAO_MANUAL: 'acesso:liberacao_manual',
  ACESSO_CREDENCIAIS_VISUALIZAR: 'acesso:credenciais_visualizar',
  PLANOS_CONTRATAR_RENOVAR: 'planos:contratar_renovar',
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

const OWNER_ONLY_PERMISSIONS = [
  PERMISSIONS.FECHAMENTO_REABRIR,
  PERMISSIONS.PLANOS_GERENCIAR,
  PERMISSIONS.PLANO_CONTAS_GERENCIAR_REDE,
  PERMISSIONS.RELATORIOS_REDE_INTEGRAL,
];

const ACADEMIA_ADMIN_PERMISSIONS = Object.values(PERMISSIONS).filter(
  (permission) => !PLATFORM_ONLY_PERMISSIONS.includes(permission)
);

// O fluxo de estorno de venda nao vale para o suporte da plataforma, que
// depende do sublote de controles master.
const ESTORNO_VENDA_PERMISSIONS = [
  PERMISSIONS.VENDAS_ESTORNO_SOLICITAR,
  PERMISSIONS.VENDAS_ESTORNO_APROVAR,
  PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO,
  PERMISSIONS.VENDAS_ESTORNO_EXECUTAR,
];

const ROLE_PERMISSIONS = Object.freeze({
  [USER_ROLES.PLATFORM_ADMIN]: Object.values(PERMISSIONS).filter(
    (permission) => !OWNER_ONLY_PERMISSIONS.includes(permission)
      && permission !== PERMISSIONS.FECHAMENTO_FECHAR
      && permission !== PERMISSIONS.MENSALIDADES_DESCONTO
      && permission !== PERMISSIONS.VENDAS_REGISTRAR
      && permission !== PERMISSIONS.PRODUTOS_GERENCIAR
      && !ESTORNO_VENDA_PERMISSIONS.includes(permission)
  ),
  [USER_ROLES.OWNER]: ACADEMIA_ADMIN_PERMISSIONS,
  [USER_ROLES.ADMIN]: ACADEMIA_ADMIN_PERMISSIONS.filter(
    (permission) => !OWNER_ONLY_PERMISSIONS.includes(permission)
  ),
  [USER_ROLES.GESTOR]: [
    PERMISSIONS.VENDAS_REGISTRAR,
    PERMISSIONS.VENDAS_ESTORNO_SOLICITAR,
    PERMISSIONS.VENDAS_ESTORNO_APROVAR,
    PERMISSIONS.PRODUTOS_GERENCIAR,
    PERMISSIONS.ALUNOS_ALTERAR_STATUS_VENCIMENTO,
    PERMISSIONS.ALUNOS_EDITAR,
    PERMISSIONS.MENSALIDADES_EMITIR_PADRAO,
    PERMISSIONS.MENSALIDADES_DESCONTO,
    PERMISSIONS.PAGAMENTOS_REGISTRAR,
    PERMISSIONS.ALUNOS_ALTERAR_PLANO_COM_DEPENDENTES,
  ],
  [USER_ROLES.FINANCEIRO]: [
    PERMISSIONS.MENSALIDADES_DESCONTO,
    PERMISSIONS.FINANCEIRO_ACESSAR,
    PERMISSIONS.REVERSAO_EXECUTAR,
    PERMISSIONS.VENDAS_ESTORNO_SOLICITAR,
    PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO,
    PERMISSIONS.VENDAS_ESTORNO_EXECUTAR,
  ],
  [USER_ROLES.RECEPCAO]: [
    PERMISSIONS.VENDAS_REGISTRAR,
    PERMISSIONS.VENDAS_ESTORNO_SOLICITAR,
    PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO,
    PERMISSIONS.VENDAS_ESTORNO_EXECUTAR,
    PERMISSIONS.ALUNOS_EDITAR,
    PERMISSIONS.MENSALIDADES_EMITIR_PADRAO,
    PERMISSIONS.PAGAMENTOS_REGISTRAR,
  ],
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
