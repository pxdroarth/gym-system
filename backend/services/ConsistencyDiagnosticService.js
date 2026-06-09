const CRITICIDADE = Object.freeze({
  CRITICO: 'critico',
  ALTO: 'alto',
  MEDIO: 'medio',
  BAIXO: 'baixo',
  INFORMATIVO: 'informativo',
});

const DEFAULT_EXAMPLE_LIMIT = 5;
const BLOCKING_CRITICIDADES = Object.freeze([CRITICIDADE.CRITICO, CRITICIDADE.ALTO]);

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_EXAMPLE_LIMIT;
  return Math.min(50, limit);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function all(db, sql, params = []) {
  if (!db || typeof db.all !== 'function') {
    throw new Error('Cliente read-only invalido: metodo all(sql, params) ausente.');
  }
  return db.all(sql, params);
}

function sumRows(rows, field = 'total') {
  return (rows || []).reduce((total, row) => total + toNumber(row?.[field]), 0);
}

function createResult({ id, titulo, criticidade, descricao, total, exemplos = [], detalhes = null, erro = null }) {
  return {
    id,
    titulo,
    criticidade,
    descricao,
    total: toNumber(total),
    status: erro ? 'erro' : (toNumber(total) > 0 ? 'achado' : 'ok'),
    erro,
    exemplos,
    detalhes,
  };
}

function countSqlFrom(selectSql) {
  return `SELECT COUNT(*) AS total FROM (${selectSql}) diagnostico_count`;
}

async function runSelectCheck(db, context, check) {
  const countRows = await all(db, countSqlFrom(check.sql), check.params(context));
  const total = toNumber(countRows?.[0]?.total);
  const exemplos = total > 0
    ? await all(db, `${check.sql} LIMIT ?`, [...check.params(context), context.exampleLimit])
    : [];

  return createResult({
    id: check.id,
    titulo: check.titulo,
    criticidade: check.criticidade,
    descricao: check.descricao,
    total,
    exemplos,
  });
}

async function runGroupedCheck(db, context, check) {
  const rows = await all(db, check.sql, check.params(context));
  const achados = rows.filter((row) => toNumber(row.total) > 0);
  const total = sumRows(achados);
  const criticidade = typeof check.resolveCriticidade === 'function'
    ? check.resolveCriticidade(achados)
    : check.criticidade;

  return createResult({
    id: check.id,
    titulo: check.titulo,
    criticidade,
    descricao: check.descricao,
    total,
    exemplos: achados.slice(0, context.exampleLimit),
    detalhes: { grupos: achados },
  });
}

const CHECKS = Object.freeze([
  {
    id: 'mensalidade_paga_sem_pagamento',
    titulo: 'Mensalidade paga sem pagamento',
    criticidade: CRITICIDADE.CRITICO,
    descricao: 'Mensalidade com status pago sem pagamento correspondente valido no mesmo escopo.',
    params: () => [],
    sql: `
      SELECT m.id, m.aluno_id, m.plano_id, m.valor_cobrado, m.vencimento, m.tenant_id, m.unit_id
      FROM mensalidade m
      WHERE m.status = 'pago'
        AND COALESCE(m.deleted_at, '') = ''
        AND NOT EXISTS (
          SELECT 1
          FROM pagamento p
          WHERE p.mensalidade_id = m.id
            AND COALESCE(p.valor_pago, 0) > 0
            AND COALESCE(p.tenant_id, m.tenant_id, -1) = COALESCE(m.tenant_id, p.tenant_id, -1)
            AND COALESCE(p.unit_id, m.unit_id, -1) = COALESCE(m.unit_id, p.unit_id, -1)
        )
      ORDER BY m.id
    `,
  },
  {
    id: 'pagamento_sem_mensalidade_valida',
    titulo: 'Pagamento sem mensalidade valida',
    criticidade: CRITICIDADE.CRITICO,
    descricao: 'Pagamento apontando para mensalidade inexistente, removida ou fora do mesmo escopo.',
    params: () => [],
    sql: `
      SELECT p.id, p.mensalidade_id, p.valor_pago, p.data_pagamento, p.tenant_id, p.unit_id,
             CASE
               WHEN m.id IS NULL THEN 'mensalidade_inexistente'
               WHEN COALESCE(m.deleted_at, '') != '' THEN 'mensalidade_removida'
               WHEN p.tenant_id IS NOT NULL AND m.tenant_id IS NOT NULL AND p.tenant_id != m.tenant_id THEN 'tenant_divergente'
               WHEN p.unit_id IS NOT NULL AND m.unit_id IS NOT NULL AND p.unit_id != m.unit_id THEN 'unit_divergente'
               ELSE 'indefinido'
             END AS motivo
      FROM pagamento p
      LEFT JOIN mensalidade m ON m.id = p.mensalidade_id
      WHERE m.id IS NULL
         OR COALESCE(m.deleted_at, '') != ''
         OR (p.tenant_id IS NOT NULL AND m.tenant_id IS NOT NULL AND p.tenant_id != m.tenant_id)
         OR (p.unit_id IS NOT NULL AND m.unit_id IS NOT NULL AND p.unit_id != m.unit_id)
      ORDER BY p.id
    `,
  },
  {
    id: 'mensalidade_paga_vigente_sem_conta_financeira',
    titulo: 'Mensalidade paga vigente sem conta financeira',
    criticidade: CRITICIDADE.ALTO,
    descricao: 'Cobertura paga vigente sem lancamento financeiro derivado ativo.',
    params: (context) => [context.today, context.today],
    sql: `
      SELECT m.id, m.aluno_id, m.plano_id, m.valor_cobrado, m.data_inicio, m.data_fim, m.vencimento, m.tenant_id, m.unit_id
      FROM mensalidade m
      WHERE m.status = 'pago'
        AND COALESCE(m.deleted_at, '') = ''
        AND DATE(COALESCE(NULLIF(m.data_inicio, ''), m.vencimento)) <= DATE(?)
        AND DATE(COALESCE(NULLIF(m.data_fim, ''), m.vencimento)) >= DATE(?)
        AND NOT EXISTS (
          SELECT 1
          FROM conta_financeira cf
          WHERE cf.origem = 'mensalidade'
            AND cf.origem_id = m.id
            AND COALESCE(cf.deleted_at, '') = ''
            AND COALESCE(cf.tenant_id, m.tenant_id, -1) = COALESCE(m.tenant_id, cf.tenant_id, -1)
            AND COALESCE(cf.unit_id, m.unit_id, -1) = COALESCE(m.unit_id, cf.unit_id, -1)
        )
      ORDER BY m.id
    `,
  },
  {
    id: 'conta_financeira_mensalidade_sem_mensalidade_ativa',
    titulo: 'Conta financeira de mensalidade sem mensalidade ativa',
    criticidade: CRITICIDADE.ALTO,
    descricao: 'Lancamento financeiro derivado de mensalidade sem origem ativa correspondente.',
    params: () => [],
    sql: `
      SELECT cf.id, cf.origem, cf.origem_id, cf.valor, cf.status, cf.data_lancamento, cf.tenant_id, cf.unit_id,
             CASE
               WHEN m.id IS NULL THEN 'mensalidade_inexistente'
               WHEN COALESCE(m.deleted_at, '') != '' THEN 'mensalidade_removida'
               WHEN cf.tenant_id IS NOT NULL AND m.tenant_id IS NOT NULL AND cf.tenant_id != m.tenant_id THEN 'tenant_divergente'
               WHEN cf.unit_id IS NOT NULL AND m.unit_id IS NOT NULL AND cf.unit_id != m.unit_id THEN 'unit_divergente'
               ELSE 'indefinido'
             END AS motivo
      FROM conta_financeira cf
      LEFT JOIN mensalidade m ON m.id = cf.origem_id
      WHERE cf.origem = 'mensalidade'
        AND COALESCE(cf.deleted_at, '') = ''
        AND (
          m.id IS NULL
          OR COALESCE(m.deleted_at, '') != ''
          OR (cf.tenant_id IS NOT NULL AND m.tenant_id IS NOT NULL AND cf.tenant_id != m.tenant_id)
          OR (cf.unit_id IS NOT NULL AND m.unit_id IS NOT NULL AND cf.unit_id != m.unit_id)
        )
      ORDER BY cf.id
    `,
  },
  {
    id: 'conta_financeira_derivada_duplicada',
    titulo: 'Conta financeira derivada duplicada',
    criticidade: CRITICIDADE.ALTO,
    descricao: 'Mais de um lancamento financeiro ativo para a mesma origem derivada.',
    grouped: true,
    params: () => [],
    sql: `
      SELECT origem, origem_id, tenant_id, unit_id, COUNT(*) AS total, GROUP_CONCAT(id) AS conta_financeira_ids
      FROM conta_financeira
      WHERE COALESCE(deleted_at, '') = ''
        AND origem IS NOT NULL
        AND origem != ''
        AND origem != 'conta_financeira'
      GROUP BY origem, origem_id, COALESCE(tenant_id, -1), COALESCE(unit_id, -1)
      HAVING COUNT(*) > 1
      ORDER BY total DESC, origem, origem_id
    `,
  },
  {
    id: 'pagamentos_multiplos_por_mensalidade',
    titulo: 'Pagamentos multiplos por mensalidade',
    criticidade: CRITICIDADE.ALTO,
    descricao: 'Mais de um pagamento para a mesma mensalidade no mesmo escopo.',
    grouped: true,
    params: () => [],
    sql: `
      SELECT mensalidade_id, tenant_id, unit_id, COUNT(*) AS total, GROUP_CONCAT(id) AS pagamento_ids
      FROM pagamento
      GROUP BY mensalidade_id, COALESCE(tenant_id, -1), COALESCE(unit_id, -1)
      HAVING COUNT(*) > 1
      ORDER BY total DESC, mensalidade_id
    `,
  },
  {
    id: 'pagamento_valor_status_inconsistente',
    titulo: 'Pagamento incompatavel com status',
    criticidade: CRITICIDADE.ALTO,
    descricao: 'Mensalidade pago/parcial com soma de pagamentos incompatavel com o valor cobrado.',
    params: () => [],
    sql: `
      SELECT m.id, m.aluno_id, m.status, m.valor_cobrado, COALESCE(SUM(p.valor_pago), 0) AS total_pago,
             COUNT(p.id) AS pagamentos, m.tenant_id, m.unit_id
      FROM mensalidade m
      JOIN pagamento p ON p.mensalidade_id = m.id
      WHERE m.status IN ('pago', 'parcial')
        AND COALESCE(m.deleted_at, '') = ''
        AND COALESCE(p.tenant_id, m.tenant_id, -1) = COALESCE(m.tenant_id, p.tenant_id, -1)
        AND COALESCE(p.unit_id, m.unit_id, -1) = COALESCE(m.unit_id, p.unit_id, -1)
      GROUP BY m.id, m.aluno_id, m.status, m.valor_cobrado, m.tenant_id, m.unit_id
      HAVING (
        m.status = 'pago'
        AND ROUND(COALESCE(SUM(p.valor_pago), 0) * 100) < ROUND(COALESCE(m.valor_cobrado, 0) * 100)
      ) OR (
        m.status = 'parcial'
        AND ROUND(COALESCE(SUM(p.valor_pago), 0) * 100) >= ROUND(COALESCE(m.valor_cobrado, 0) * 100)
      )
      ORDER BY m.id
    `,
  },
  {
    id: 'cobertura_paga_sobreposta',
    titulo: 'Cobertura paga sobreposta',
    criticidade: CRITICIDADE.CRITICO,
    descricao: 'Duas mensalidades pagas ativas com intersecao de cobertura para o mesmo aluno financeiro.',
    params: () => [],
    sql: `
      WITH coberturas AS (
        SELECT m.id, m.aluno_id,
               COALESCE((
                 SELECT pa.responsavel_id
                 FROM plano_associado pa
                 WHERE pa.aluno_id = m.aluno_id
                   AND COALESCE(pa.status, 'ativo') != 'encerrado'
                   AND COALESCE(pa.tenant_id, m.tenant_id, -1) = COALESCE(m.tenant_id, pa.tenant_id, -1)
                   AND COALESCE(pa.unit_id, m.unit_id, -1) = COALESCE(m.unit_id, pa.unit_id, -1)
                 ORDER BY pa.id DESC
                 LIMIT 1
               ), m.aluno_id) AS aluno_financeiro_id,
               m.data_inicio, m.data_fim, m.vencimento, m.tenant_id, m.unit_id
        FROM mensalidade m
        WHERE m.status = 'pago'
          AND COALESCE(m.deleted_at, '') = ''
      )
      SELECT c1.aluno_financeiro_id, c1.id AS mensalidade_id_1, c2.id AS mensalidade_id_2,
             COALESCE(NULLIF(c1.data_inicio, ''), c1.vencimento) AS inicio_1,
             COALESCE(NULLIF(c1.data_fim, ''), c1.vencimento) AS fim_1,
             COALESCE(NULLIF(c2.data_inicio, ''), c2.vencimento) AS inicio_2,
             COALESCE(NULLIF(c2.data_fim, ''), c2.vencimento) AS fim_2,
             c1.tenant_id, c1.unit_id
      FROM coberturas c1
      JOIN coberturas c2 ON c2.id > c1.id
        AND c2.aluno_financeiro_id = c1.aluno_financeiro_id
        AND COALESCE(c2.tenant_id, -1) = COALESCE(c1.tenant_id, -1)
        AND COALESCE(c2.unit_id, -1) = COALESCE(c1.unit_id, -1)
      WHERE DATE(COALESCE(NULLIF(c1.data_inicio, ''), c1.vencimento)) <= DATE(COALESCE(NULLIF(c2.data_fim, ''), c2.vencimento))
        AND DATE(COALESCE(NULLIF(c2.data_inicio, ''), c2.vencimento)) <= DATE(COALESCE(NULLIF(c1.data_fim, ''), c1.vencimento))
      ORDER BY c1.aluno_financeiro_id, c1.id, c2.id
    `,
  },
  {
    id: 'plano_politica_inconsistente',
    titulo: 'Plano com politica inconsistente',
    criticidade: CRITICIDADE.ALTO,
    descricao: 'Planos com campos de politica fora das regras comerciais atuais.',
    grouped: true,
    params: () => [],
    sql: `
      SELECT 'tipo_cobranca_invalido' AS check_name, COUNT(*) AS total, GROUP_CONCAT(id) AS plano_ids
      FROM plano
      WHERE COALESCE(tipo_cobranca, 'AVULSO_MENSAL') NOT IN ('AVULSO_MENSAL', 'PACOTE_PRE_PAGO', 'RECORRENTE_CONTRATUAL', 'CORTESIA_ISENTO')
      UNION ALL
      SELECT 'pacote_pre_pago_com_divida_automatica', COUNT(*) AS total, GROUP_CONCAT(id) AS plano_ids
      FROM plano
      WHERE COALESCE(tipo_cobranca, 'AVULSO_MENSAL') = 'PACOTE_PRE_PAGO'
        AND COALESCE(gera_divida_automatica, 0) = 1
      UNION ALL
      SELECT 'avulso_mensal_sem_pagamento_ato', COUNT(*) AS total, GROUP_CONCAT(id) AS plano_ids
      FROM plano
      WHERE COALESCE(tipo_cobranca, 'AVULSO_MENSAL') = 'AVULSO_MENSAL'
        AND COALESCE(exige_pagamento_ato, 1) != 1
      UNION ALL
      SELECT 'desconto_percentual_invalido', COUNT(*) AS total, GROUP_CONCAT(id) AS plano_ids
      FROM plano
      WHERE COALESCE(desconto_percentual, 0) < 0
         OR COALESCE(desconto_percentual, 0) >= 100
      UNION ALL
      SELECT 'duracao_em_dias_invalida', COUNT(*) AS total, GROUP_CONCAT(id) AS plano_ids
      FROM plano
      WHERE COALESCE(duracao_em_dias, 0) <= 0
    `,
  },
  {
    id: 'registros_sem_escopo',
    titulo: 'Registros criticos sem escopo',
    criticidade: CRITICIDADE.ALTO,
    descricao: 'Registros operacionais sem tenant_id ou unit_id quando o modelo atual exige escopo.',
    grouped: true,
    params: () => [],
    sql: `
      SELECT 'aluno' AS tabela, COUNT(*) AS total FROM aluno WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'plano_associado', COUNT(*) FROM plano_associado WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'mensalidade', COUNT(*) FROM mensalidade WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'pagamento', COUNT(*) FROM pagamento WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'acesso', COUNT(*) FROM acesso WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'produto', COUNT(*) FROM produto WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'venda_produto', COUNT(*) FROM venda_produto WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'conta_financeira', COUNT(*) FROM conta_financeira WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'fechamento_mensal', COUNT(*) FROM fechamento_mensal WHERE tenant_id IS NULL OR unit_id IS NULL
      UNION ALL SELECT 'reversao_controlada', COUNT(*) FROM reversao_controlada WHERE tenant_id IS NULL OR unit_id IS NULL
    `,
  },
  {
    id: 'mensalidade_em_aberto_parcial_vigente_ou_futura',
    titulo: 'Mensalidade aberta/parcial vigente ou futura',
    criticidade: CRITICIDADE.BAIXO,
    descricao: 'Sinal financeiro/operacional; nao e cobertura paga nem divida universal automaticamente.',
    grouped: true,
    params: (context) => [context.today],
    sql: `
      SELECT status, COUNT(*) AS total, COALESCE(SUM(valor_cobrado), 0) AS valor_total
      FROM mensalidade
      WHERE status IN ('em_aberto', 'parcial')
        AND COALESCE(deleted_at, '') = ''
        AND DATE(COALESCE(NULLIF(data_fim, ''), vencimento)) >= DATE(?)
      GROUP BY status
      ORDER BY status
    `,
  },
  {
    id: 'aluno_ativo_sem_cobertura_por_tipo_cobranca',
    titulo: 'Aluno ativo sem cobertura por tipo de cobranca',
    criticidade: CRITICIDADE.INFORMATIVO,
    descricao: 'Ausencia de cobertura por politica do plano; AVULSO_MENSAL e esperado, outros tipos pedem atencao.',
    custom: true,
  },
]);

async function runAlunoSemCoberturaCheck(db, context) {
  const groupedRows = await all(db, `
    WITH alunos_financeiros AS (
      SELECT a.id, a.nome, a.plano_id, p.tipo_cobranca,
             COALESCE((
               SELECT pa.responsavel_id
               FROM plano_associado pa
               WHERE pa.aluno_id = a.id
                 AND COALESCE(pa.status, 'ativo') != 'encerrado'
                 AND COALESCE(pa.tenant_id, a.tenant_id, -1) = COALESCE(a.tenant_id, pa.tenant_id, -1)
                 AND COALESCE(pa.unit_id, a.unit_id, -1) = COALESCE(a.unit_id, pa.unit_id, -1)
               ORDER BY pa.id DESC
               LIMIT 1
             ), a.id) AS aluno_financeiro_id,
             a.tenant_id, a.unit_id
      FROM aluno a
      JOIN plano p ON p.id = a.plano_id
      WHERE COALESCE(a.status, '') = 'ativo'
    )
    SELECT COALESCE(tipo_cobranca, 'AVULSO_MENSAL') AS tipo_cobranca, COUNT(*) AS total
    FROM alunos_financeiros af
    WHERE NOT EXISTS (
      SELECT 1
      FROM mensalidade m
      WHERE m.aluno_id = af.aluno_financeiro_id
        AND m.status = 'pago'
        AND COALESCE(m.deleted_at, '') = ''
        AND COALESCE(m.tenant_id, af.tenant_id, -1) = COALESCE(af.tenant_id, m.tenant_id, -1)
        AND COALESCE(m.unit_id, af.unit_id, -1) = COALESCE(af.unit_id, m.unit_id, -1)
        AND DATE(COALESCE(NULLIF(m.data_inicio, ''), m.vencimento)) <= DATE(?)
        AND DATE(COALESCE(NULLIF(m.data_fim, ''), m.vencimento)) >= DATE(?)
    )
    GROUP BY COALESCE(tipo_cobranca, 'AVULSO_MENSAL')
    ORDER BY tipo_cobranca
  `, [context.today, context.today]);

  const exemplos = await all(db, `
    WITH alunos_financeiros AS (
      SELECT a.id, a.nome, a.plano_id, p.tipo_cobranca,
             COALESCE((
               SELECT pa.responsavel_id
               FROM plano_associado pa
               WHERE pa.aluno_id = a.id
                 AND COALESCE(pa.status, 'ativo') != 'encerrado'
                 AND COALESCE(pa.tenant_id, a.tenant_id, -1) = COALESCE(a.tenant_id, pa.tenant_id, -1)
                 AND COALESCE(pa.unit_id, a.unit_id, -1) = COALESCE(a.unit_id, pa.unit_id, -1)
               ORDER BY pa.id DESC
               LIMIT 1
             ), a.id) AS aluno_financeiro_id,
             a.tenant_id, a.unit_id
      FROM aluno a
      JOIN plano p ON p.id = a.plano_id
      WHERE COALESCE(a.status, '') = 'ativo'
    )
    SELECT id AS aluno_id, nome, plano_id, COALESCE(tipo_cobranca, 'AVULSO_MENSAL') AS tipo_cobranca,
           aluno_financeiro_id, tenant_id, unit_id,
           CASE
             WHEN COALESCE(tipo_cobranca, 'AVULSO_MENSAL') IN ('PACOTE_PRE_PAGO', 'RECORRENTE_CONTRATUAL') THEN 'atencao'
             ELSE 'esperado_ou_informativo'
           END AS classificacao_operacional
    FROM alunos_financeiros af
    WHERE NOT EXISTS (
      SELECT 1
      FROM mensalidade m
      WHERE m.aluno_id = af.aluno_financeiro_id
        AND m.status = 'pago'
        AND COALESCE(m.deleted_at, '') = ''
        AND COALESCE(m.tenant_id, af.tenant_id, -1) = COALESCE(af.tenant_id, m.tenant_id, -1)
        AND COALESCE(m.unit_id, af.unit_id, -1) = COALESCE(af.unit_id, m.unit_id, -1)
        AND DATE(COALESCE(NULLIF(m.data_inicio, ''), m.vencimento)) <= DATE(?)
        AND DATE(COALESCE(NULLIF(m.data_fim, ''), m.vencimento)) >= DATE(?)
    )
    ORDER BY tipo_cobranca, id
    LIMIT ?
  `, [context.today, context.today, context.exampleLimit]);

  const total = sumRows(groupedRows);
  const hasAttention = groupedRows.some((row) => (
    ['PACOTE_PRE_PAGO', 'RECORRENTE_CONTRATUAL'].includes(row.tipo_cobranca)
    && toNumber(row.total) > 0
  ));

  return createResult({
    id: 'aluno_ativo_sem_cobertura_por_tipo_cobranca',
    titulo: 'Aluno ativo sem cobertura por tipo de cobranca',
    criticidade: hasAttention ? CRITICIDADE.MEDIO : CRITICIDADE.INFORMATIVO,
    descricao: 'Ausencia de cobertura por politica do plano; AVULSO_MENSAL e esperado, outros tipos pedem atencao.',
    total,
    exemplos,
    detalhes: { grupos: groupedRows.filter((row) => toNumber(row.total) > 0) },
  });
}

async function collectTableCounts(db) {
  const rows = await all(db, `
    SELECT 'aluno' AS tabela, COUNT(*) AS total FROM aluno
    UNION ALL SELECT 'plano', COUNT(*) FROM plano
    UNION ALL SELECT 'mensalidade', COUNT(*) FROM mensalidade
    UNION ALL SELECT 'pagamento', COUNT(*) FROM pagamento
    UNION ALL SELECT 'conta_financeira', COUNT(*) FROM conta_financeira
  `);
  return rows;
}

async function runCheck(db, context, check) {
  try {
    if (check.custom && check.id === 'aluno_ativo_sem_cobertura_por_tipo_cobranca') {
      return runAlunoSemCoberturaCheck(db, context);
    }
    if (check.grouped) return runGroupedCheck(db, context, check);
    return runSelectCheck(db, context, check);
  } catch (error) {
    return createResult({
      id: check.id,
      titulo: check.titulo,
      criticidade: CRITICIDADE.CRITICO,
      descricao: check.descricao,
      total: 1,
      erro: error.message,
    });
  }
}

function summarize(checks) {
  const base = {
    [CRITICIDADE.CRITICO]: { checks: 0, achados: 0 },
    [CRITICIDADE.ALTO]: { checks: 0, achados: 0 },
    [CRITICIDADE.MEDIO]: { checks: 0, achados: 0 },
    [CRITICIDADE.BAIXO]: { checks: 0, achados: 0 },
    [CRITICIDADE.INFORMATIVO]: { checks: 0, achados: 0 },
  };

  for (const check of checks) {
    if (!base[check.criticidade]) {
      base[check.criticidade] = { checks: 0, achados: 0 };
    }
    base[check.criticidade].checks += check.total > 0 ? 1 : 0;
    base[check.criticidade].achados += check.total;
  }

  return base;
}

function hasBlockingFindings(checks) {
  return checks.some((check) => check.total > 0 && BLOCKING_CRITICIDADES.includes(check.criticidade));
}

function buildHumanSummary(payload) {
  const lines = [
    '== Diagnostico read-only de consistencia operacional ==',
    `Data base: ${payload.metadata.data_base}`,
    `Modo: read-only (${payload.metadata.read_only ? 'sim' : 'nao'})`,
    `Checks executados: ${payload.resultado.total_checks}`,
    `Checks com achados: ${payload.resultado.checks_com_achados}`,
    `Resultado: ${payload.resultado.tem_bloqueio ? 'achados criticos/altos encontrados' : 'sem achados criticos/altos'}`,
    '',
  ];

  for (const check of payload.checks) {
    lines.push(`[${check.criticidade.toUpperCase()}] ${check.id}: ${check.total}`);
    if (check.erro) lines.push(`  erro: ${check.erro}`);
  }

  return lines;
}

async function runConsistencyDiagnostics(options = {}) {
  const context = {
    today: options.today || hojeISO(),
    exampleLimit: normalizeLimit(options.exampleLimit),
  };

  const checks = [];
  for (const check of CHECKS) {
    checks.push(await runCheck(options.db, context, check));
  }

  let tabelas = [];
  try {
    tabelas = await collectTableCounts(options.db);
  } catch (error) {
    tabelas = [{ erro: error.message }];
  }

  const payload = {
    metadata: {
      generated_at: new Date().toISOString(),
      data_base: context.today,
      example_limit: context.exampleLimit,
      read_only: true,
      blocking_criticidades: BLOCKING_CRITICIDADES,
    },
    contexto: {
      tabelas,
    },
    resultado: {
      total_checks: checks.length,
      checks_com_achados: checks.filter((check) => check.total > 0).length,
      tem_bloqueio: hasBlockingFindings(checks),
      resumo_por_criticidade: summarize(checks),
    },
    checks,
  };

  return {
    resumoHumano: buildHumanSummary(payload),
    payload,
  };
}

module.exports = {
  CRITICIDADE,
  BLOCKING_CRITICIDADES,
  DEFAULT_EXAMPLE_LIMIT,
  runConsistencyDiagnostics,
  buildHumanSummary,
};
