const TENANT_STATUS = Object.freeze({
  ATIVO: 'ativo',
  INATIVO: 'inativo',
});

const UNIT_STATUS = Object.freeze({
  ATIVA: 'ativa',
  INATIVA: 'inativa',
});

const USER_SCOPE_STATUS = Object.freeze({
  ATIVO: 'ativo',
  INATIVO: 'inativo',
});

const DEFAULT_TENANT = Object.freeze({
  nome: 'Academia Principal',
  documento: 'bootstrap-local',
});

const DEFAULT_UNIT = Object.freeze({
  nome: 'Unidade Matriz',
  codigo: 'matriz',
});

module.exports = {
  TENANT_STATUS,
  UNIT_STATUS,
  USER_SCOPE_STATUS,
  DEFAULT_TENANT,
  DEFAULT_UNIT,
};
