const MENSALIDADE_STATUS = Object.freeze({
  EM_ABERTO: 'em_aberto',
  PARCIAL: 'parcial',
  PAGO: 'pago',
  VENCIDO: 'vencido',
  CANCELADO: 'cancelado',
  EM_REVERSAO_CONTROLADA: 'em_reversao_controlada',
  BLOQUEADA_POR_FECHAMENTO: 'bloqueada_por_fechamento',
});

const ACESSO_STATUS = Object.freeze({
  LIBERADO: 'liberado',
  LIBERADO_COM_RESTRICAO: 'liberado_com_restricao',
  LIBERADO_MANUAL: 'liberado_manual',
  BLOQUEADO_INADIMPLENCIA: 'bloqueado_inadimplencia',
  BLOQUEADO_INATIVO: 'bloqueado_inativo',
  BLOQUEADO_PENDENTE_REGULARIZACAO: 'bloqueado_pendente_regularizacao',
});

const ACESSO_RESULTADO = Object.freeze({
  PERMITIDO: 'permitido',
  NEGADO: 'negado',
});

const FECHAMENTO_STATUS = Object.freeze({
  ABERTO: 'aberto',
  FECHADO: 'fechado',
  REABERTO: 'reaberto',
  FECHADO_COM_INCONSISTENCIAS: 'fechado_com_inconsistencias',
});

const VINCULO_STATUS = Object.freeze({
  ATIVO: 'ativo',
  PENDENTE_REGULARIZACAO: 'pendente_regularizacao',
  ENCERRADO: 'encerrado',
});

const values = (stateMap) => Object.values(stateMap);

module.exports = {
  MENSALIDADE_STATUS,
  MENSALIDADE_STATUS_VALUES: values(MENSALIDADE_STATUS),
  ACESSO_STATUS,
  ACESSO_STATUS_VALUES: values(ACESSO_STATUS),
  ACESSO_RESULTADO,
  ACESSO_RESULTADO_VALUES: values(ACESSO_RESULTADO),
  FECHAMENTO_STATUS,
  FECHAMENTO_STATUS_VALUES: values(FECHAMENTO_STATUS),
  VINCULO_STATUS,
  VINCULO_STATUS_VALUES: values(VINCULO_STATUS),
};
