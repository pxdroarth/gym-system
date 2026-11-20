// Pagamento por meio da venda de produto (L04, decisao 16/11/2026).
//
// A venda do caixa so e concluida quitada: os valores informados por meio
// (dinheiro, Pix, cartao) somam exatamente o total calculado pelo servidor a
// partir do preco de catalogo. Cada valor e gravado em venda_pagamento como
// 'recebimento', ligado a venda. A receita continua sendo um unico lancamento
// por venda em conta_financeira; venda_pagamento so detalha por qual meio o
// dinheiro entrou ou saiu, para a conferencia somar por meio sem duplicar a
// receita.
//
// No estorno executado, o operador confirma o que foi devolvido por meio
// ('devolucao'). O padrao sugerido sao os mesmos meios e valores da venda; um
// meio diferente exige motivo e referencia do comprovante. Vendas anteriores
// ao pagamento por meio ficam sem recebimentos: a interface mostra "meio nao
// registrado" e nenhum meio e atribuido sem evidencia.
//
// Todos os valores sao comparados em centavos inteiros.
const AppError = require('../errors/AppError');
const { paraCentavos, deCentavos } = require('../utils/dinheiro');

const MEIOS = Object.freeze({
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
});
const MEIOS_VALORES = Object.freeze(Object.keys(MEIOS));
const MAX_ITENS = 10;

const TIPO = Object.freeze({ RECEBIMENTO: 'recebimento', DEVOLUCAO: 'devolucao' });

// Lista de { meio, valor } -> [{ meio, centavos }] na ordem informada.
function normalizarLista(lista, { obrigatoria, codigoObrigatorio, rotulo }) {
  if (lista === undefined || lista === null) {
    if (obrigatoria) {
      throw new AppError(`Informe os ${rotulo} por meio`, 400, codigoObrigatorio);
    }
    return null;
  }
  if (!Array.isArray(lista) || lista.length === 0) {
    throw new AppError(`Informe ao menos um valor nos ${rotulo}`, 400, codigoObrigatorio);
  }
  if (lista.length > MAX_ITENS) {
    throw new AppError(`No maximo ${MAX_ITENS} valores por operacao`, 400, codigoObrigatorio);
  }
  return lista.map((item, indice) => {
    const meio = String(item?.meio || '').trim();
    if (!MEIOS_VALORES.includes(meio)) {
      throw new AppError(`Meio de pagamento invalido: use ${MEIOS_VALORES.join(', ')}`, 400, 'PAGAMENTO_MEIO_INVALIDO', { indice, meio: item?.meio ?? null });
    }
    // Aceita numero ou texto com ate duas casas ("2", "2.5", "2,50").
    const bruto = item?.valor;
    const centavos = typeof bruto === 'number' || typeof bruto === 'string' ? paraCentavos(bruto) : null;
    if (!Number.isInteger(centavos) || centavos <= 0) {
      throw new AppError('Valor por meio deve ser positivo, com no maximo duas casas decimais', 400, 'PAGAMENTO_VALOR_INVALIDO', {
        indice, valor: bruto ?? null,
      });
    }
    return { meio, centavos };
  });
}

function normalizarPagamentos(lista) {
  return normalizarLista(lista, { obrigatoria: true, codigoObrigatorio: 'PAGAMENTOS_OBRIGATORIOS', rotulo: 'pagamentos' });
}

function normalizarDevolucoes(lista) {
  return normalizarLista(lista, { obrigatoria: false, codigoObrigatorio: 'DEVOLUCAO_OBRIGATORIA', rotulo: 'valores devolvidos' });
}

const somaCentavos = (lista) => lista.reduce((soma, item) => soma + item.centavos, 0);

// Quitacao exata: falta -> 422 PAGAMENTO_INCOMPLETO; sobra -> 422 PAGAMENTO_ACIMA_DO_TOTAL.
function exigirQuitacao(totalCentavos, pagamentos) {
  const informado = somaCentavos(pagamentos);
  const detalhes = { total: deCentavos(totalCentavos), informado: deCentavos(informado) };
  if (informado < totalCentavos) {
    throw new AppError(`Pagamento incompleto: faltam R$ ${deCentavos(totalCentavos - informado).toFixed(2)}`, 422, 'PAGAMENTO_INCOMPLETO', {
      ...detalhes, restante: deCentavos(totalCentavos - informado),
    });
  }
  if (informado > totalCentavos) {
    throw new AppError('Os valores informados passam do total da venda', 422, 'PAGAMENTO_ACIMA_DO_TOTAL', {
      ...detalhes, excedente: deCentavos(informado - totalCentavos),
    });
  }
}

// Mapa meio -> centavos.
function porMeio(lista) {
  const mapa = new Map();
  for (const item of lista) mapa.set(item.meio, (mapa.get(item.meio) || 0) + item.centavos);
  return mapa;
}

function mesmosMeiosEValores(a, b) {
  const ma = porMeio(a);
  const mb = porMeio(b);
  if (ma.size !== mb.size) return false;
  for (const [meio, valor] of ma) if (mb.get(meio) !== valor) return false;
  return true;
}

async function registrarItens(tx, { venda, estornoId = null, tipo, itens, referencia = null, actor, scope, registradoEm }) {
  for (const item of itens) {
    await tx.run(
      `INSERT INTO venda_pagamento
        (tenant_id, unit_id, venda_id, venda_estorno_id, tipo, meio, valor_centavos, comprovante_referencia,
         registrado_por, registrado_por_nome, registrado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scope.tenant_id, scope.unit_id, venda.id, estornoId, tipo, item.meio, item.centavos, referencia,
        actor?.id != null ? String(actor.id) : null, actor?.name || null, registradoEm]
    );
  }
}

async function listarItens(executor, vendaIds, scope) {
  if (!vendaIds.length) return [];
  return executor.all(
    `SELECT venda_id, venda_estorno_id, tipo, meio, valor_centavos, comprovante_referencia,
            registrado_por, registrado_por_nome, registrado_em
     FROM venda_pagamento
     WHERE tenant_id = ? AND unit_id = ? AND venda_id IN (${vendaIds.map(() => '?').join(',')})
     ORDER BY id`,
    [scope.tenant_id, scope.unit_id, ...vendaIds]
  );
}

// Conferencia de uma venda: recebido, devolvido e liquido por meio, em reais.
// pagamento_registrado = false para vendas anteriores ao pagamento por meio.
function montarResumo(itens) {
  const recebimentos = itens.filter((i) => i.tipo === TIPO.RECEBIMENTO);
  const devolucoes = itens.filter((i) => i.tipo === TIPO.DEVOLUCAO);
  const meios = new Map();
  const linha = (meio) => {
    if (!meios.has(meio)) meios.set(meio, { meio, rotulo: MEIOS[meio] || meio, recebido: 0, devolvido: 0 });
    return meios.get(meio);
  };
  for (const r of recebimentos) linha(r.meio).recebido += r.valor_centavos;
  for (const d of devolucoes) linha(d.meio).devolvido += d.valor_centavos;
  const lista = [...meios.values()]
    .sort((a, b) => MEIOS_VALORES.indexOf(a.meio) - MEIOS_VALORES.indexOf(b.meio))
    .map((m) => ({
      meio: m.meio,
      rotulo: m.rotulo,
      recebido: deCentavos(m.recebido),
      devolvido: deCentavos(m.devolvido),
      liquido: deCentavos(m.recebido - m.devolvido),
    }));
  const total = (tipoLista) => tipoLista.reduce((s, i) => s + i.valor_centavos, 0);
  const mapear = (i) => ({
    meio: i.meio,
    rotulo: MEIOS[i.meio] || i.meio,
    valor: deCentavos(i.valor_centavos),
    comprovante_referencia: i.comprovante_referencia,
    registrado_por: i.registrado_por,
    registrado_por_nome: i.registrado_por_nome,
    registrado_em: i.registrado_em,
    venda_estorno_id: i.venda_estorno_id,
  });
  return {
    pagamento_registrado: recebimentos.length > 0,
    recebimentos: recebimentos.map(mapear),
    devolucoes: devolucoes.map(mapear),
    meios: lista,
    total_recebido: deCentavos(total(recebimentos)),
    total_devolvido: deCentavos(total(devolucoes)),
    total_liquido: deCentavos(total(recebimentos) - total(devolucoes)),
  };
}

async function resumoDasVendas(executor, vendaIds, scope) {
  const itens = await listarItens(executor, vendaIds, scope);
  const porVenda = new Map(vendaIds.map((id) => [Number(id), []]));
  for (const item of itens) porVenda.get(Number(item.venda_id))?.push(item);
  return new Map([...porVenda.entries()].map(([id, lista]) => [id, montarResumo(lista)]));
}

module.exports = {
  MEIOS,
  MEIOS_VALORES,
  TIPO,
  normalizarPagamentos,
  normalizarDevolucoes,
  exigirQuitacao,
  somaCentavos,
  mesmosMeiosEValores,
  registrarItens,
  resumoDasVendas,
  montarResumo,
};
