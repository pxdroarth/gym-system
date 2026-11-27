// Conferencia por meio do periodo (L04, sublote D; decisao 6 de 16/11/2026).
//
// Soma, por meio de pagamento, o dinheiro que entrou e saiu da unidade no
// periodo, a partir dos registros que guardam o meio:
// - vendas: recebimentos e devolucoes (venda_pagamento), pela data da venda,
//   como na conferencia do caixa de vendas;
// - mensalidades: pagamentos nao estornados pela data do pagamento e
//   devolucoes de estorno pela data operacional do estorno;
// - contas manuais: baixas de contas a receber (entrada) e a pagar (saida)
//   pela data da baixa.
// O que entrou sem meio registrado (vendas, pagamentos e baixas anteriores ao
// registro por meio) aparece separado, sem meio atribuido.
const { deCentavos } = require('../utils/dinheiro');

const MEIOS = Object.freeze({
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
});

const centavosSql = (coluna) => `CAST(ROUND(${coluna} * 100) AS INTEGER)`;

async function conferenciaDoPeriodo(db, inicio, fim, scope) {
  const escopo = [scope.tenant_id, scope.unit_id];
  const [vendas, pagamentos, devolucoes, contas, semMeioVendas, semMeioPagamentos, semMeioContas] = await Promise.all([
    db.all(
      `SELECT p.meio,
              SUM(CASE WHEN p.tipo = 'recebimento' THEN p.valor_centavos ELSE 0 END) AS entrada,
              SUM(CASE WHEN p.tipo = 'devolucao' THEN p.valor_centavos ELSE 0 END) AS saida
       FROM venda_pagamento p
       JOIN venda_produto vp ON vp.id = p.venda_id AND vp.tenant_id = p.tenant_id AND vp.unit_id = p.unit_id
       WHERE vp.deleted_at IS NULL AND vp.tenant_id = ? AND vp.unit_id = ?
         AND DATE(vp.data_venda) BETWEEN DATE(?) AND DATE(?)
       GROUP BY p.meio`,
      [...escopo, inicio, fim]
    ),
    db.all(
      `SELECT p.forma_pagamento AS meio, SUM(${centavosSql('p.valor_pago')}) AS entrada
       FROM pagamento p
       WHERE p.tenant_id = ? AND p.unit_id = ? AND p.estornado_em IS NULL AND p.forma_pagamento IS NOT NULL
         AND DATE(p.data_pagamento) BETWEEN DATE(?) AND DATE(?)
       GROUP BY p.forma_pagamento`,
      [...escopo, inicio, fim]
    ),
    db.all(
      `SELECT d.meio, SUM(d.valor_centavos) AS saida
       FROM pagamento_devolucao d
       JOIN pagamento_estorno e ON e.id = d.pagamento_estorno_id
       WHERE d.tenant_id = ? AND d.unit_id = ?
         AND DATE(e.data_operacao) BETWEEN DATE(?) AND DATE(?)
       GROUP BY d.meio`,
      [...escopo, inicio, fim]
    ),
    db.all(
      `SELECT baixa_meio AS meio,
              SUM(CASE WHEN tipo = 'receita' THEN ${centavosSql('valor')} ELSE 0 END) AS entrada,
              SUM(CASE WHEN tipo = 'despesa' THEN ${centavosSql('valor')} ELSE 0 END) AS saida
       FROM conta_financeira
       WHERE tenant_id = ? AND unit_id = ? AND deleted_at IS NULL AND origem = 'conta_financeira'
         AND status = 'pago' AND baixa_meio IS NOT NULL
         AND DATE(data_baixa) BETWEEN DATE(?) AND DATE(?)
       GROUP BY baixa_meio`,
      [...escopo, inicio, fim]
    ),
    db.get(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(${centavosSql('vp.valor_total')}), 0) AS centavos
       FROM venda_produto vp
       WHERE vp.deleted_at IS NULL AND vp.tenant_id = ? AND vp.unit_id = ?
         AND DATE(vp.data_venda) BETWEEN DATE(?) AND DATE(?)
         AND NOT EXISTS (SELECT 1 FROM venda_pagamento p WHERE p.venda_id = vp.id AND p.tipo = 'recebimento')`,
      [...escopo, inicio, fim]
    ),
    db.get(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(${centavosSql('valor_pago')}), 0) AS centavos
       FROM pagamento
       WHERE tenant_id = ? AND unit_id = ? AND estornado_em IS NULL AND forma_pagamento IS NULL
         AND DATE(data_pagamento) BETWEEN DATE(?) AND DATE(?)`,
      [...escopo, inicio, fim]
    ),
    db.get(
      `SELECT COUNT(*) AS quantidade, COALESCE(SUM(${centavosSql('valor')}), 0) AS centavos
       FROM conta_financeira
       WHERE tenant_id = ? AND unit_id = ? AND deleted_at IS NULL AND origem = 'conta_financeira'
         AND status = 'pago' AND baixa_meio IS NULL
         AND DATE(COALESCE(data_baixa, data_lancamento)) BETWEEN DATE(?) AND DATE(?)`,
      [...escopo, inicio, fim]
    ),
  ]);

  const por = (lista, meio, campo) => Number(lista.find((l) => l.meio === meio)?.[campo] || 0);
  const meios = Object.keys(MEIOS).map((meio) => {
    const c = {
      vendas_entrada: por(vendas, meio, 'entrada'),
      vendas_saida: por(vendas, meio, 'saida'),
      mensalidades_entrada: por(pagamentos, meio, 'entrada'),
      mensalidades_saida: por(devolucoes, meio, 'saida'),
      contas_entrada: por(contas, meio, 'entrada'),
      contas_saida: por(contas, meio, 'saida'),
    };
    const entrada = c.vendas_entrada + c.mensalidades_entrada + c.contas_entrada;
    const saida = c.vendas_saida + c.mensalidades_saida + c.contas_saida;
    return {
      meio,
      rotulo: MEIOS[meio],
      ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, deCentavos(v)])),
      entrada: deCentavos(entrada),
      saida: deCentavos(saida),
      liquido: deCentavos(entrada - saida),
      _entrada: entrada,
      _saida: saida,
    };
  });
  const totalEntrada = meios.reduce((s, m) => s + m._entrada, 0);
  const totalSaida = meios.reduce((s, m) => s + m._saida, 0);
  const semMeio = (r) => ({ quantidade: Number(r?.quantidade || 0), valor: deCentavos(Number(r?.centavos || 0)) });
  return {
    meios: meios.map(({ _entrada, _saida, ...m }) => m),
    total: { entrada: deCentavos(totalEntrada), saida: deCentavos(totalSaida), liquido: deCentavos(totalEntrada - totalSaida) },
    sem_meio_registrado: {
      vendas: semMeio(semMeioVendas),
      mensalidades: semMeio(semMeioPagamentos),
      contas: semMeio(semMeioContas),
    },
  };
}

module.exports = { MEIOS, conferenciaDoPeriodo };
