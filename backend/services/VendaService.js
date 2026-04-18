const { runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const FinanceiroService = require('./FinanceiroService');

async function registrarVenda(payload = {}, actor) {
  const { produto_id, quantidade, preco_unitario } = payload;

  if (!produto_id || !quantidade) {
    throw new AppError('Campos obrigatorios faltando', 400, 'VENDA_PAYLOAD_INVALIDO');
  }

  return runTransaction(async (tx) => {
    const produto = await tx.get('SELECT * FROM produto WHERE id = ?', [produto_id]);
    if (!produto) throw new AppError('Produto nao encontrado', 404, 'PRODUTO_NAO_ENCONTRADO');

    const qtd = Number(quantidade);
    const precoUnit = Number(preco_unitario || produto.preco);

    if (!Number.isInteger(qtd) || qtd <= 0) throw new AppError('quantidade invalida', 400, 'QUANTIDADE_INVALIDA');
    if (!Number.isFinite(precoUnit) || precoUnit <= 0) throw new AppError('preco_unitario invalido', 400, 'PRECO_INVALIDO');
    if (Number(produto.estoque) < qtd) throw new AppError('Estoque insuficiente', 400, 'ESTOQUE_INSUFICIENTE');

    const dataVenda = new Date().toISOString().slice(0, 10);
    await FechamentoMensalService.assertPeriodoEditavelPorData(dataVenda, 'venda de produto', tx);

    const valor_total = qtd * precoUnit;
    const venda = await tx.run(
      `INSERT INTO venda_produto (produto_id, produto_nome, quantidade, preco_unitario, valor_total)
       VALUES (?, ?, ?, ?, ?)`,
      [produto_id, produto.nome, qtd, precoUnit, valor_total]
    );

    await tx.run('UPDATE produto SET estoque = estoque - ? WHERE id = ?', [qtd, produto_id]);
    const produtoDepois = await tx.get('SELECT * FROM produto WHERE id = ?', [produto_id]);

    await FinanceiroService.upsertLancamentoFinanceiro({
      descricao: `Venda ${venda.lastID}`,
      tipo: 'receita',
      valor: valor_total,
      data_lancamento: dataVenda,
      status: 'pago',
      plano_contas_id: 2,
      origem: 'venda_produto',
      origem_id: venda.lastID,
    }, tx);

    const vendaCriada = {
      id: venda.lastID,
      produto_id,
      produto_nome: produto.nome,
      quantidade: qtd,
      preco_unitario: precoUnit,
      valor_total,
    };

    await AuditService.logAction({
      actor,
      action: 'registrar_venda_produto',
      module: 'vendas_produtos',
      recordType: 'venda_produto',
      recordId: venda.lastID,
      before: { produto },
      after: { venda: vendaCriada, produto: produtoDepois },
      metadata: { estoque_anterior: produto.estoque, estoque_atual: produtoDepois?.estoque },
    }, tx);

    return vendaCriada;
  });
}

module.exports = {
  registrarVenda,
};
