const { runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const FinanceiroService = require('./FinanceiroService');
const VendaPagamentoService = require('./VendaPagamentoService');
const { paraCentavos, deCentavos } = require('../utils/dinheiro');

const camposVenda = 'id, produto_id, produto_nome, quantidade, preco_unitario, valor_total, tenant_id, unit_id';

// Venda no caixa (L04, decisao 16/11/2026): preco de catalogo calculado pelo
// servidor e quitacao obrigatoria por meio (dinheiro, Pix, cartao) antes de
// gravar a venda e baixar o estoque. Preco manual e recusado no piloto,
// inclusive em chamadas diretas.
const presente = (valor) => valor !== undefined && valor !== null && valor !== '';

async function registrarVenda(payload = {}, actor, scope = null, chave = null) {
  const produtoId = Number(payload.produto_id);
  if (!produtoId || !payload.quantidade) {
    throw new AppError('Campos obrigatorios faltando', 400, 'VENDA_PAYLOAD_INVALIDO');
  }
  if (presente(payload.preco_unitario) || presente(payload.valor_total)) {
    throw new AppError('No piloto a venda usa o preco de catalogo; preco manual nao e aceito', 422, 'PRECO_MANUAL_NAO_PERMITIDO', {
      campos: ['preco_unitario', 'valor_total'].filter((campo) => presente(payload[campo])),
    });
  }
  if (!scope?.tenant_id || !scope?.unit_id) {
    throw new AppError('Escopo de rede/unidade obrigatorio para registrar venda', 403, 'ESCOPO_OBRIGATORIO');
  }
  if (chave != null && !/^[A-Za-z0-9._:-]{1,128}$/.test(chave)) {
    throw new AppError('Chave de idempotencia invalida', 400, 'IDEMPOTENCIA_CHAVE_INVALIDA');
  }
  const qtd = Number(payload.quantidade);
  if (!Number.isInteger(qtd) || qtd <= 0) throw new AppError('quantidade invalida', 400, 'QUANTIDADE_INVALIDA');
  const pagamentos = VendaPagamentoService.normalizarPagamentos(payload.pagamentos);

  const { tenant_id, unit_id } = scope;
  const dadosRequisicao = chave
    ? JSON.stringify([produtoId, qtd, 'catalogo', pagamentos.map((p) => [p.meio, p.centavos])])
    : null;

  return runTransaction(async (tx) => {
    if (chave) {
      const anterior = await tx.get(
        `SELECT ${camposVenda}, idempotencia_payload FROM venda_produto
         WHERE tenant_id = ? AND unit_id = ? AND chave_idempotencia = ?`,
        [tenant_id, unit_id, chave]
      );
      if (anterior) {
        const { idempotencia_payload, ...venda } = anterior;
        if (idempotencia_payload !== dadosRequisicao) {
          throw new AppError('Chave ja usada com outros dados de venda', 409, 'IDEMPOTENCIA_CONFLITO');
        }
        const resumo = (await VendaPagamentoService.resumoDasVendas(tx, [venda.id], scope)).get(Number(venda.id));
        return { venda: { ...venda, ...resumo }, reenvio: true };
      }
    }

    const produto = await tx.get(
      'SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [produtoId, tenant_id, unit_id]
    );
    if (!produto) throw new AppError('Produto nao encontrado', 404, 'PRODUTO_NAO_ENCONTRADO');

    const precoCentavos = paraCentavos(produto.preco);
    if (!Number.isInteger(precoCentavos) || precoCentavos <= 0) {
      throw new AppError('Produto sem preco de catalogo valido', 422, 'PRECO_CATALOGO_INVALIDO');
    }
    if (Number(produto.estoque) < qtd) throw new AppError('Estoque insuficiente', 400, 'ESTOQUE_INSUFICIENTE');
    const totalCentavos = precoCentavos * qtd;
    VendaPagamentoService.exigirQuitacao(totalCentavos, pagamentos);
    const precoUnit = deCentavos(precoCentavos);

    const dataVenda = new Date().toISOString().slice(0, 10);
    await FechamentoMensalService.assertPeriodoEditavelPorData(dataVenda, 'venda de produto', tx, scope);

    const valorTotal = deCentavos(totalCentavos);
    const venda = await tx.run(
      `INSERT INTO venda_produto (produto_id, produto_nome, quantidade, preco_unitario, valor_total, tenant_id, unit_id,
                                 chave_idempotencia, idempotencia_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [produtoId, produto.nome, qtd, precoUnit, valorTotal, tenant_id, unit_id, chave, dadosRequisicao]
    );

    await tx.run(
      'UPDATE produto SET estoque = estoque - ? WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [qtd, produtoId, tenant_id, unit_id]
    );
    const produtoDepois = await tx.get(
      'SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [produtoId, tenant_id, unit_id]
    );

    await FinanceiroService.upsertLancamentoFinanceiro({
      descricao: `Venda ${venda.lastID}`,
      tipo: 'receita',
      valor: valorTotal,
      data_lancamento: dataVenda,
      status: 'pago',
      plano_contas_id: 2,
      origem: 'venda_produto',
      origem_id: venda.lastID,
      tenant_id,
      unit_id,
    }, tx);

    const vendaCriada = await tx.get(`SELECT ${camposVenda} FROM venda_produto WHERE id = ?`, [venda.lastID]);
    await VendaPagamentoService.registrarItens(tx, {
      venda: vendaCriada,
      tipo: VendaPagamentoService.TIPO.RECEBIMENTO,
      itens: pagamentos,
      actor,
      scope,
      registradoEm: new Date().toISOString(),
    });
    const resumo = (await VendaPagamentoService.resumoDasVendas(tx, [vendaCriada.id], scope)).get(Number(vendaCriada.id));
    await AuditService.logAction({
      actor,
      action: 'registrar_venda_produto',
      module: 'vendas_produtos',
      recordType: 'venda_produto',
      recordId: venda.lastID,
      before: { produto },
      after: { venda: vendaCriada, produto: produtoDepois },
      metadata: {
        estoque_anterior: produto.estoque,
        estoque_atual: produtoDepois?.estoque,
        preco: 'catalogo',
        pagamentos: pagamentos.map((p) => ({ meio: p.meio, valor: deCentavos(p.centavos) })),
      },
      tenant_id,
      unit_id,
    }, tx);

    return { venda: { ...vendaCriada, ...resumo }, reenvio: false };
  });
}

module.exports = {
  registrarVenda,
};
