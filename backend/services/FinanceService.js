const { runQuery, runGet, runExecute } = require('../dbHelper');

// Sincroniza mensalidade -> pagamento (garante 1 pagamento p/ cada mensalidade)
async function sincronizarPagamentosDeMensalidades() {
  const mensalidades = await runQuery('SELECT * FROM mensalidade');
  for (const m of mensalidades) {
    const pag = await runGet('SELECT * FROM pagamento WHERE mensalidade_id = ?', [m.id]);
    if (!pag) {
      await runExecute(
        'INSERT INTO pagamento (mensalidade_id, valor_previsto) VALUES (?, ?)',
        [m.id, m.valor_cobrado]
      );
    }
  }
}

// Sincroniza mensalidades na conta_financeira (retroativo e atual)
async function sincronizarLancamentosMensalidades() {
  const mensalidades = await runQuery('SELECT * FROM mensalidade');
  for (const m of mensalidades) {
    const existe = await runGet(
      "SELECT id FROM conta_financeira WHERE origem = ? AND origem_id = ?",
      ['mensalidade', m.id]
    );
    if (!existe) {
      // Garante uma data sempre válida
      const dataLancamento = m.data_pagamento || m.vencimento || m.data_vencimento || new Date().toISOString().slice(0,10);
      await runExecute(
        `INSERT INTO conta_financeira
          (descricao, tipo, valor, data_lancamento, status, plano_contas_id, origem, origem_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          `Mensalidade ${m.id}`,
          'receita',
          m.valor_cobrado,
          dataLancamento,
          (m.status === 'pago' ? 'pago' : 'pendente'),
          1, // ID do plano de contas para mensalidades (ajuste se necessário)
          'mensalidade',
          m.id
        ]
      );
    }
  }
}

// Sincroniza vendas na conta_financeira (retroativo e atual)
async function sincronizarLancamentosVendas() {
  const vendas = await runQuery('SELECT * FROM venda_produto');
  for (const v of vendas) {
    const existe = await runGet(
      "SELECT id FROM conta_financeira WHERE origem = ? AND origem_id = ?",
      ['venda_produto', v.id]
    );
    if (!existe) {
      // Garante uma data sempre válida
      const dataLancamento = v.data_venda || new Date().toISOString().slice(0,10);
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
          2, // ID do plano de contas para vendas (ajuste se necessário)
          'venda_produto',
          v.id
        ]
      );
    }
  }
}

// Sincroniza todo o financeiro (pagamentos de mensalidades, mensalidades, vendas)
async function sincronizarFinanceiro() {
  await sincronizarPagamentosDeMensalidades();
  await sincronizarLancamentosMensalidades();
  await sincronizarLancamentosVendas();
  // Futuro: await sincronizarOrcamentos();
  // ...mais integrações!
  return true;
}

module.exports = { sincronizarFinanceiro };
