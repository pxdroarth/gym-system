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
  if (['0', 'false', 'nao', 'no', 'off'].includes(normalized)) return false;
  return Boolean(fallback);
}

function normalizarNumeroNaoNegativo(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
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
  normalizarPoliticaPlano,
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
