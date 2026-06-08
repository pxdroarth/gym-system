const AppError = require('../errors/AppError');
const { runGet } = require('../dbHelper');
const { MENSALIDADE_STATUS } = require('../constants/domainStates');
const {
  TIPO_COBRANCA,
  normalizarPoliticaPlano,
  calcularDuracaoCoberturaDias,
  calcularDescontoPercentual,
} = require('./PlanoPolicyService');

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function isISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function clientOrDefault(client) {
  return client || { get: runGet };
}

function toMoney(value, fieldName) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new AppError(`${fieldName} invalido`, 400, 'COBERTURA_PREVIEW_VALOR_INVALIDO', { field: fieldName });
  }
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

function resolverDataInicio(payload) {
  const data = payload.dataInicio || payload.data_inicio || payload.dataReferencia || payload.data_referencia || hojeISO();
  if (!isISODate(data)) {
    throw new AppError('data_inicio invalida', 400, 'COBERTURA_PREVIEW_DATA_INVALIDA');
  }
  return data;
}

function resolverValorBase(plano, payload) {
  const valor = hasValue(payload.valorManual) ? payload.valorManual
    : hasValue(payload.valor_manual) ? payload.valor_manual
      : hasValue(plano.valor_base) ? plano.valor_base
        : plano.valor;

  if (!hasValue(valor)) {
    throw new AppError('valor_base invalido', 400, 'COBERTURA_PREVIEW_VALOR_INVALIDO', { field: 'valor_base' });
  }

  return toMoney(valor, 'valor_base');
}

function resolverDescontoManual(payload) {
  if (hasValue(payload.descontoManual)) return toMoney(payload.descontoManual, 'desconto_manual');
  if (hasValue(payload.desconto_manual)) return toMoney(payload.desconto_manual, 'desconto_manual');
  return 0;
}

function buildRegrasAplicadas(policy, input) {
  const regras = [
    'politica_do_plano_normalizada',
    'cobertura_calculada_por_duracao_em_dias',
    'desconto_percentual_do_plano_aplicado',
  ];

  if (hasValue(input.valorManual) || hasValue(input.valor_manual)) {
    regras.push('valor_manual_usado_como_base');
  }

  if (hasValue(input.descontoManual) || hasValue(input.desconto_manual)) {
    regras.push('desconto_manual_somado_ao_desconto_percentual_do_plano');
  }

  if (policy.tipo_cobranca === TIPO_COBRANCA.AVULSO_MENSAL) {
    regras.push('avulso_mensal_sem_divida_automatica_por_padrao');
  }

  if (policy.tipo_cobranca === TIPO_COBRANCA.PACOTE_PRE_PAGO) {
    regras.push('pacote_pre_pago_representado_por_cobertura_unica');
  }

  if (policy.tipo_cobranca === TIPO_COBRANCA.RECORRENTE_CONTRATUAL) {
    regras.push('recorrente_contratual_preservado_sem_cobranca_automatica_neste_preview');
  }

  if (policy.tipo_cobranca === TIPO_COBRANCA.CORTESIA_ISENTO) {
    regras.push('cortesia_isento_apenas_representado_sem_liberacao_automatica');
  }

  return regras;
}

function aplicarRegrasDominio(policy) {
  if ([TIPO_COBRANCA.AVULSO_MENSAL, TIPO_COBRANCA.PACOTE_PRE_PAGO].includes(policy.tipo_cobranca)) {
    return {
      ...policy,
      exige_pagamento_ato: true,
      gera_divida_automatica: false,
      gera_cobertura_apos_pagamento: true,
    };
  }

  return policy;
}

function calcularPreviewContratacaoRenovacao(payload = {}) {
  const { aluno, plano } = payload;

  if (!aluno?.id) {
    throw new AppError('aluno e obrigatorio', 400, 'COBERTURA_PREVIEW_ALUNO_OBRIGATORIO');
  }

  if (!plano?.id) {
    throw new AppError('plano e obrigatorio', 400, 'COBERTURA_PREVIEW_PLANO_OBRIGATORIO');
  }

  const policy = aplicarRegrasDominio(normalizarPoliticaPlano(plano));
  const duracaoDias = Number(calcularDuracaoCoberturaDias(plano));
  if (!Number.isFinite(duracaoDias) || duracaoDias <= 0) {
    throw new AppError('duracao_em_dias invalida', 400, 'COBERTURA_PREVIEW_DURACAO_INVALIDA');
  }

  const dataInicio = resolverDataInicio(payload);
  const dataFim = addDays(dataInicio, Math.floor(duracaoDias) - 1);
  const valorBase = resolverValorBase(plano, payload);
  const descontoPercentual = Number(calcularDescontoPercentual(plano));
  const descontoPlano = Math.round(((valorBase * descontoPercentual) / 100 + Number.EPSILON) * 100) / 100;
  const descontoManual = resolverDescontoManual(payload);
  const descontoAplicado = Math.round((descontoPlano + descontoManual + Number.EPSILON) * 100) / 100;

  if (descontoAplicado > valorBase) {
    throw new AppError(
      'desconto_aplicado nao pode ser maior que o valor base',
      400,
      'COBERTURA_PREVIEW_DESCONTO_MAIOR_QUE_VALOR'
    );
  }

  const valorCobrado = Math.round((valorBase - descontoAplicado + Number.EPSILON) * 100) / 100;

  return {
    aluno_id: aluno.id,
    plano_id: plano.id,
    tipo_cobranca: policy.tipo_cobranca,
    data_inicio: dataInicio,
    data_fim: dataFim,
    duracao_dias: Math.floor(duracaoDias),
    valor_base: valorBase,
    desconto_percentual: descontoPercentual,
    desconto_percentual_valor: descontoPlano,
    desconto_manual: descontoManual,
    desconto_aplicado: descontoAplicado,
    valor_cobrado: valorCobrado,
    exige_pagamento_ato: policy.exige_pagamento_ato,
    gera_divida_automatica: policy.gera_divida_automatica,
    gera_cobertura_apos_pagamento: policy.gera_cobertura_apos_pagamento,
    permite_renovacao_avulsa: policy.permite_renovacao_avulsa,
    observacoes: {
      escrita_banco: false,
      desconto_manual_interacao: 'desconto_manual_somado_ao_desconto_percentual_do_plano',
      cobertura_efetiva: policy.gera_cobertura_apos_pagamento
        ? 'apos_pagamento_confirmado'
        : 'conforme_politica_do_plano',
    },
    regras_aplicadas: buildRegrasAplicadas(policy, payload),
  };
}

async function buscarCoberturaPagaSobreposta(payload = {}, client = null) {
  const alunoId = Number(payload.aluno_id);
  const tenantId = Number(payload.scope?.tenant_id);
  const unitId = Number(payload.scope?.unit_id);

  if (!alunoId || !tenantId || !unitId || !isISODate(payload.data_inicio) || !isISODate(payload.data_fim)) {
    return null;
  }

  const db = clientOrDefault(client);
  const dataInicioExpr = `
    COALESCE(
      NULLIF(NULLIF(data_inicio, ''), '0000-00-00'),
      NULLIF(NULLIF(vencimento, ''), '0000-00-00')
    )
  `;
  const dataFimExpr = `
    COALESCE(
      NULLIF(NULLIF(data_fim, ''), '0000-00-00'),
      NULLIF(NULLIF(vencimento, ''), '0000-00-00')
    )
  `;

  return db.get(
    `SELECT *
     FROM mensalidade
     WHERE aluno_id = ?
       AND tenant_id = ?
       AND unit_id = ?
       AND status = ?
       AND deleted_at IS NULL
       AND ${dataInicioExpr} IS NOT NULL
       AND ${dataFimExpr} IS NOT NULL
       AND DATE(${dataInicioExpr}) <= DATE(?)
       AND DATE(${dataFimExpr}) >= DATE(?)
     ORDER BY DATE(${dataInicioExpr}) ASC, id ASC
     LIMIT 1`,
    [alunoId, tenantId, unitId, MENSALIDADE_STATUS.PAGO, payload.data_fim, payload.data_inicio]
  );
}

module.exports = {
  calcularPreviewContratacaoRenovacao,
  calcularPreviewContratacaoPlano: calcularPreviewContratacaoRenovacao,
  calcularPreviewRenovacaoPlano: calcularPreviewContratacaoRenovacao,
  buscarCoberturaPagaSobreposta,
};
