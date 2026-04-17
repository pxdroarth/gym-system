const { runQuery, runExecute } = require('../dbHelper');

async function sincronizarLancamentosMensalidades() {
  await runExecute("DELETE FROM conta_financeira WHERE origem = 'mensalidade'");

  const mensalidades = await runQuery(`
    SELECT m.*,
           (
             SELECT MAX(p.data_pagamento)
             FROM pagamento p
             WHERE p.mensalidade_id = m.id
           ) AS data_pagamento
    FROM mensalidade m
    WHERE m.vencimento IS NOT NULL
      AND m.vencimento != '0000-00-00'
  `);

  for (const m of mensalidades) {
    const dataLancamento = m.status === 'pago'
      ? (m.data_pagamento || (m.updated_at ? String(m.updated_at).slice(0, 10) : null) || m.vencimento)
      : m.vencimento;

    await runExecute(
      `INSERT INTO conta_financeira
        (descricao, tipo, valor, data_lancamento, status, plano_contas_id, origem, origem_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        `Mensalidade ${m.id}`,
        'receita',
        Number(m.valor_cobrado || 0),
        dataLancamento,
        m.status === 'pago' ? 'pago' : 'pendente',
        1,
        'mensalidade',
        m.id,
      ]
    );
  }
}

async function sincronizarLancamentosVendas() {
  const vendas = await runQuery('SELECT * FROM venda_produto');
  for (const v of vendas) {
    const existe = await runQuery(
      "SELECT id FROM conta_financeira WHERE origem = ? AND origem_id = ?",
      ['venda_produto', v.id]
    );
    if (!existe.length) {
      const dataLancamento = v.data_venda || new Date().toISOString().slice(0, 10);
      await runExecute(
        `INSERT INTO conta_financeira
          (descricao, tipo, valor, data_lancamento, status, plano_contas_id, origem, origem_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          `Venda ${v.id}`,
          'receita',
          v.valor_total,
          dataLancamento,
          'pago',
          2,
          'venda_produto',
          v.id,
        ]
      );
    }
  }
}

async function sincronizarFinanceiro() {
  await sincronizarLancamentosMensalidades();
  await sincronizarLancamentosVendas();
  return true;
}

module.exports = { sincronizarFinanceiro };
