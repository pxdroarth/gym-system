const TIPO_COBRANCA = Object.freeze({
  AVULSO_MENSAL: 'AVULSO_MENSAL',
  PACOTE_PRE_PAGO: 'PACOTE_PRE_PAGO',
  RECORRENTE_CONTRATUAL: 'RECORRENTE_CONTRATUAL',
  CORTESIA_ISENTO: 'CORTESIA_ISENTO',
});

const TIPO_COBRANCA_VALUES = Object.freeze(Object.values(TIPO_COBRANCA));

const DEFAULT_POLICY = Object.freeze({
  tipo_cobranca: TIPO_COBRANCA.AVULSO_MENSAL,
  exige_pagamento_ato: true,
  gera_divida_automatica: false,
  gera_cobertura_apos_pagamento: true,
  permite_renovacao_avulsa: true,
  desconto_percentual: 0,
});

const POLICY_FLAG_FIELDS = Object.freeze([
  'exige_pagamento_ato',
  'gera_divida_automatica',
  'gera_cobertura_apos_pagamento',
  'permite_renovacao_avulsa',
]);

const POLICY_FIELDS = Object.freeze([
  'tipo_cobranca',
  ...POLICY_FLAG_FIELDS,
  'desconto_percentual',
]);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizarTipoCobranca(value) {
  const normalized = String(value || DEFAULT_POLICY.tipo_cobranca).trim().toUpperCase();
  return TIPO_COBRANCA_VALUES.includes(normalized) ? normalized : DEFAULT_POLICY.tipo_cobranca;
}

function normalizarBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'sim', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'nao', 'não', 'no', 'off'].includes(normalized)) return false;
  return Boolean(fallback);
}

function normalizarNumeroNaoNegativo(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function isBooleanLike(value) {
  if (isBlank(value)) return true;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 0 || value === 1;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'sim', 'yes', 'on', '0', 'false', 'nao', 'não', 'no', 'off'].includes(normalized);
}

function validarPoliticaPlanoInput(plano = {}) {
  if (hasOwn(plano, 'tipo_cobranca') && !isBlank(plano.tipo_cobranca)) {
    const normalized = String(plano.tipo_cobranca).trim().toUpperCase();
    if (!TIPO_COBRANCA_VALUES.includes(normalized)) {
      return `tipo_cobranca inválido. Use: ${TIPO_COBRANCA_VALUES.join(', ')}`;
    }
  }

  for (const field of POLICY_FLAG_FIELDS) {
    if (hasOwn(plano, field) && !isBooleanLike(plano[field])) {
      return `${field} deve ser 0 ou 1`;
    }
  }

  if (hasOwn(plano, 'desconto_percentual') && !isBlank(plano.desconto_percentual)) {
    const desconto = Number(plano.desconto_percentual);
    if (!Number.isFinite(desconto) || desconto < 0) {
      return 'desconto_percentual inválido';
    }
  }

  return null;
}

function normalizarPoliticaPlano(plano = {}) {
  return {
    tipo_cobranca: normalizarTipoCobranca(plano.tipo_cobranca),
    exige_pagamento_ato: normalizarBoolean(plano.exige_pagamento_ato, DEFAULT_POLICY.exige_pagamento_ato),
    gera_divida_automatica: normalizarBoolean(plano.gera_divida_automatica, DEFAULT_POLICY.gera_divida_automatica),
    gera_cobertura_apos_pagamento: normalizarBoolean(
      plano.gera_cobertura_apos_pagamento,
      DEFAULT_POLICY.gera_cobertura_apos_pagamento
    ),
    permite_renovacao_avulsa: normalizarBoolean(plano.permite_renovacao_avulsa, DEFAULT_POLICY.permite_renovacao_avulsa),
    desconto_percentual: normalizarNumeroNaoNegativo(plano.desconto_percentual, DEFAULT_POLICY.desconto_percentual),
    duracao_cobertura_dias: calcularDuracaoCoberturaDias(plano),
  };
}

function isPlanoAvulso(plano) {
  return normalizarPoliticaPlano(plano).tipo_cobranca === TIPO_COBRANCA.AVULSO_MENSAL;
}

function isPacotePrePago(plano) {
  return normalizarPoliticaPlano(plano).tipo_cobranca === TIPO_COBRANCA.PACOTE_PRE_PAGO;
}

function isRecorrenteContratual(plano) {
  return normalizarPoliticaPlano(plano).tipo_cobranca === TIPO_COBRANCA.RECORRENTE_CONTRATUAL;
}

function isCortesiaOuIsento(plano) {
  return normalizarPoliticaPlano(plano).tipo_cobranca === TIPO_COBRANCA.CORTESIA_ISENTO;
}

function exigePagamentoNoAto(plano) {
  return normalizarPoliticaPlano(plano).exige_pagamento_ato;
}

function geraDividaAutomatica(plano) {
  return normalizarPoliticaPlano(plano).gera_divida_automatica;
}

function geraCoberturaAposPagamento(plano) {
  return normalizarPoliticaPlano(plano).gera_cobertura_apos_pagamento;
}

function permiteRenovacaoAvulsa(plano) {
  return normalizarPoliticaPlano(plano).permite_renovacao_avulsa;
}

function calcularDuracaoCoberturaDias(plano = {}) {
  return normalizarNumeroNaoNegativo(plano.duracao_em_dias, 30);
}

function calcularDescontoPercentual(plano) {
  return normalizarPoliticaPlano(plano).desconto_percentual;
}

module.exports = {
  TIPO_COBRANCA,
  TIPO_COBRANCA_VALUES,
  DEFAULT_POLICY,
  POLICY_FIELDS,
  POLICY_FLAG_FIELDS,
  normalizarPoliticaPlano,
  validarPoliticaPlanoInput,
  isPlanoAvulso,
  isPacotePrePago,
  isRecorrenteContratual,
  isCortesiaOuIsento,
  exigePagamentoNoAto,
  geraDividaAutomatica,
  geraCoberturaAposPagamento,
  permiteRenovacaoAvulsa,
  calcularDuracaoCoberturaDias,
  calcularDescontoPercentual,
};
