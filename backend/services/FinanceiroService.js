const { runQuery, runGet, runExecute } = require('../dbHelper');

function clientOrDefault(client) {
  return client || { all: runQuery, get: runGet, run: runExecute };
}

async function upsertLancamentoFinanceiro(lancamento, client = null) {
  const db = clientOrDefault(client);
  const existente = await db.get(
    'SELECT id FROM conta_financeira WHERE origem = ? AND origem_id = ?',
    [lancamento.origem, lancamento.origem_id]
  );

  if (existente) {
    await db.run(
      `UPDATE conta_financeira
       SET descricao = ?, tipo = ?, valor = ?, data_lancamento = ?, status = ?, plano_contas_id = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        lancamento.descricao,
        lancamento.tipo,
        lancamento.valor,
        lancamento.data_lancamento,
        lancamento.status,
        lancamento.plano_contas_id,
        existente.id,
      ]
    );
    return existente.id;
  }

  const result = await db.run(
    `INSERT INTO conta_financeira
      (descricao, tipo, valor, data_lancamento, status, plano_contas_id, origem, origem_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      lancamento.descricao,
      lancamento.tipo,
      lancamento.valor,
      lancamento.data_lancamento,
      lancamento.status,
      lancamento.plano_contas_id,
      lancamento.origem,
      lancamento.origem_id,
    ]
  );
  return result.lastID;
}

async function sincronizarLancamentosMensalidades(client = null) {
  const db = clientOrDefault(client);
  const mensalidades = await db.all(`
    SELECT m.*,
           (
             SELECT MAX(p.data_pagamento)
             FROM pagamento p
             WHERE p.mensalidade_id = m.id
           ) AS data_pagamento,
           (
             SELECT MAX(p.valor_pago)
             FROM pagamento p
             WHERE p.mensalidade_id = m.id
           ) AS valor_pago
    FROM mensalidade m
    WHERE m.vencimento IS NOT NULL
      AND m.vencimento != '0000-00-00'
      AND m.deleted_at IS NULL
      AND COALESCE(m.status, '') != 'cancelado'
  `);

  for (const m of mensalidades) {
    const pago = m.status === 'pago' || m.status === 'parcial';
    const dataLancamento = pago
      ? (m.data_pagamento || (m.updated_at ? String(m.updated_at).slice(0, 10) : null) || m.vencimento)
      : m.vencimento;

    await upsertLancamentoFinanceiro({
      descricao: `Mensalidade ${m.id}`,
      tipo: 'receita',
      valor: Number(pago ? (m.valor_pago || m.valor_cobrado || 0) : (m.valor_cobrado || 0)),
      data_lancamento: dataLancamento,
      status: pago ? 'pago' : 'pendente',
      plano_contas_id: 1,
      origem: 'mensalidade',
      origem_id: m.id,
    }, db);
  }
}

async function sincronizarLancamentosVendas(client = null) {
  const db = clientOrDefault(client);
  const vendas = await db.all('SELECT * FROM venda_produto WHERE deleted_at IS NULL');
  for (const v of vendas) {
    const dataLancamento = v.data_venda || new Date().toISOString().slice(0, 10);
    await upsertLancamentoFinanceiro({
      descricao: `Venda ${v.id}`,
      tipo: 'receita',
      valor: Number(v.valor_total || (Number(v.quantidade || 0) * Number(v.preco_unitario || 0))),
      data_lancamento: dataLancamento,
      status: 'pago',
      plano_contas_id: 2,
      origem: 'venda_produto',
      origem_id: v.id,
    }, db);
  }
}

async function sincronizarFinanceiro(client = null) {
  await sincronizarLancamentosMensalidades(client);
  await sincronizarLancamentosVendas(client);
  return true;
}

module.exports = {
  upsertLancamentoFinanceiro,
  sincronizarFinanceiro,
  sincronizarLancamentosMensalidades,
  sincronizarLancamentosVendas,
};
