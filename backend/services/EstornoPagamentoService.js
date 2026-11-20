// Estorno de pagamento do aluno (L04, sublote A; decisoes de 16/11 e 20/11/2026).
//
// Etapas, com permissao propria e validacao de identidade, papel, Rede e
// Unidade no servidor em cada uma:
// 1. Solicitar com motivo (pagamentos:estorno_solicitar): recepcao, gestor,
//    financeiro, admin e dono. Um pedido ativo por pagamento; reenvio ou pedido
//    concorrente devolve o existente com o estado preservado.
// 2. Autorizar (mesmo modelo do estorno de venda):
//    a. aprovacao direta (pagamentos:estorno_aprovar): admin e dono;
//    b. autorizacao externa por WhatsApp ou e-mail de um admin ou dono,
//       registrada por outro operador (pagamentos:estorno_registrar_autorizacao)
//       e marcada como declarada.
//    Quem solicitou nunca autoriza o proprio pedido; quem registra nunca se
//    informa como autorizador.
// 3. Executar (pagamentos:estorno_executar): financeiro, admin e dono, com
//    aprovacao valida. A unidade pode exigir tres contas distintas
//    (unit.estorno_pagamento_contas_distintas).
//
// A execucao estorna o valor integral do pagamento escolhido (estorno parcial
// = um dos pagamentos da mensalidade), preserva a competencia e as datas de
// cobertura, recalcula o status pela soma dos pagamentos restantes e grava a
// contrapartida na data operacional da unidade. O operador confirma a
// devolucao ao cliente por meio; o meio original e o sugerido, outro meio exige
// motivo e comprovante. Pagamentos sem meio registrado (anteriores ao
// sublote) nao recebem meio atribuido. Sem a receita original ativa no escopo
// a execucao e recusada para conciliacao. Consumo da aprovacao, contrapartida,
// pagamento, mensalidade, devolucao e auditoria ficam numa unica transacao.
const { runQuery, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const ReversaoControladaService = require('./ReversaoControladaService');
const AccessService = require('./AccessService');
const dataLocal = require('../utils/dataLocal');
const { paraCentavos, deCentavos } = require('../utils/dinheiro');
const { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const { USER_SCOPE_STATUS } = require('../constants/scope');
const { comum } = require('./EstornoVendaService');

const {
  STATUS, CANAL_SISTEMA, exigirEscopo, exigirPermissao, exigirId, mesmaConta, mesDe,
  recusarPorStatus, contaAutorizadora, validarDadosExternos,
} = comum;

// Meios aceitos no pagamento da mensalidade (mesmos da tela de contratacao).
const MEIOS = Object.freeze({
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
});
const MEIOS_VALORES = Object.freeze(Object.keys(MEIOS));

// Meio informado no registro do pagamento. Ausente -> null (nao registrado).
function normalizarMeioPagamento(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const meio = String(valor).trim();
  if (!MEIOS_VALORES.includes(meio)) {
    throw new AppError(`Forma de pagamento invalida: use ${MEIOS_VALORES.join(', ')}`, 400, 'FORMA_PAGAMENTO_INVALIDA', { forma_pagamento: valor });
  }
  return meio;
}

const centavos = (valor) => paraCentavos(valor) ?? Math.round(Number(valor || 0) * 100);

async function exigeContasDistintas(tx, scope) {
  const unit = await tx.get('SELECT estorno_pagamento_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
  return Number(unit?.estorno_pagamento_contas_distintas || 0) === 1;
}

async function obterPagamento(tx, id, scope) {
  const pagamento = await tx.get('SELECT * FROM pagamento WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
  if (!pagamento) throw new AppError('Pagamento nao encontrado', 404, 'PAGAMENTO_NAO_ENCONTRADO');
  return pagamento;
}

async function obterEstorno(tx, id, scope) {
  const estorno = await tx.get('SELECT * FROM pagamento_estorno WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
  if (!estorno) throw new AppError('Solicitacao de estorno nao encontrada', 404, 'ESTORNO_NAO_ENCONTRADO');
  return estorno;
}

function exigirPagamentoAtivo(pagamento) {
  if (pagamento.estornado_em) {
    throw new AppError('Pagamento ja estornado', 409, 'PAGAMENTO_JA_ESTORNADO', { reversao_controlada_id: pagamento.reversao_controlada_id });
  }
}

async function obterMensalidade(tx, pagamento, scope) {
  const mensalidade = await tx.get('SELECT * FROM mensalidade WHERE id = ? AND tenant_id = ? AND unit_id = ?', [pagamento.mensalidade_id, scope.tenant_id, scope.unit_id]);
  if (!mensalidade || mensalidade.deleted_at) {
    throw new AppError('Mensalidade do pagamento nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');
  }
  return mensalidade;
}

async function pedidoAtivo(tx, pagamentoId, scope) {
  return tx.get(
    `SELECT * FROM pagamento_estorno WHERE pagamento_id = ? AND tenant_id = ? AND unit_id = ? AND status IN (?, ?) ORDER BY id LIMIT 1`,
    [pagamentoId, scope.tenant_id, scope.unit_id, STATUS.SOLICITADA, STATUS.APROVADA]
  );
}

const auditoria = (tx, { actor, action, estornoId, before, after, metadata, scope }) => AuditService.logAction({
  actor,
  action,
  module: 'pagamentos',
  recordType: 'pagamento_estorno',
  recordId: estornoId,
  before,
  after,
  metadata,
  tenant_id: scope.tenant_id,
  unit_id: scope.unit_id,
}, tx);

async function solicitar(pagamentoId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.PAGAMENTOS_ESTORNO_SOLICITAR);
  const id = exigirId(pagamentoId, 'PAGAMENTO_ID_INVALIDO');
  const motivo = String(payload.motivo || '').trim();
  if (!motivo) throw new AppError('Motivo e obrigatorio para solicitar o estorno', 400, 'MOTIVO_OBRIGATORIO');

  return runTransaction(async (tx) => {
    const pagamento = await obterPagamento(tx, id, scope);
    exigirPagamentoAtivo(pagamento);
    const mensalidade = await obterMensalidade(tx, pagamento, scope);
    const existente = await pedidoAtivo(tx, id, scope);
    if (existente) return { estorno: existente, existente: true };

    const agora = new Date().toISOString();
    const r = await tx.run(
      `INSERT INTO pagamento_estorno
        (tenant_id, unit_id, pagamento_id, mensalidade_id, aluno_id, status, motivo, valor_estornado, meio_original,
         solicitado_por, solicitado_por_nome, solicitado_por_papel, solicitado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scope.tenant_id, scope.unit_id, id, mensalidade.id, mensalidade.aluno_id, STATUS.SOLICITADA, motivo,
        deCentavos(centavos(pagamento.valor_pago)), pagamento.forma_pagamento || null,
        String(actor.id), actor.name || null, actor.role, agora]
    );
    const estorno = await tx.get('SELECT * FROM pagamento_estorno WHERE id = ?', [r.lastID]);
    await auditoria(tx, {
      actor, action: 'solicitar_estorno_pagamento', estornoId: estorno.id, before: null, after: estorno, scope,
      metadata: { pagamento_id: id, mensalidade_id: mensalidade.id, motivo, solicitante: { id: String(actor.id), papel: actor.role, em: agora } },
    });
    return { estorno, existente: false };
  });
}

async function aprovar(estornoId, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.PAGAMENTOS_ESTORNO_APROVAR);
  const id = exigirId(estornoId, 'ESTORNO_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const estorno = await obterEstorno(tx, id, scope);
    recusarPorStatus(estorno, 'autorizar');
    if (mesmaConta(estorno.solicitado_por, actor.id)) {
      throw new AppError('Quem solicitou o estorno nao pode aprova-lo', 403, 'AUTOAPROVACAO_PROIBIDA');
    }
    exigirPagamentoAtivo(await obterPagamento(tx, estorno.pagamento_id, scope));
    const agora = new Date().toISOString();
    const r = await tx.run(
      `UPDATE pagamento_estorno
       SET status = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_por_papel = ?, aprovado_em = ?, autorizacao_canal = ?
       WHERE id = ? AND status = ?`,
      [STATUS.APROVADA, String(actor.id), actor.name || null, actor.role, agora, CANAL_SISTEMA, id, STATUS.SOLICITADA]
    );
    if (r.changes !== 1) throw new AppError('Solicitacao mudou de estado', 409, 'ESTORNO_STATUS_ALTERADO');
    const depois = await tx.get('SELECT * FROM pagamento_estorno WHERE id = ?', [id]);
    await auditoria(tx, {
      actor, action: 'aprovar_estorno_pagamento', estornoId: id, before: estorno, after: depois, scope,
      metadata: {
        pagamento_id: estorno.pagamento_id,
        canal: CANAL_SISTEMA,
        solicitante: { id: estorno.solicitado_por, em: estorno.solicitado_em },
        autorizador: { id: String(actor.id), papel: actor.role, em: agora },
      },
    });
    return depois;
  });
}

// Autorizacao externa: data entre o dia do pagamento (data civil, sem hora) e
// o minuto do registro, como na venda legada sem hora.
async function registrarAutorizacaoExterna(estornoId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.PAGAMENTOS_ESTORNO_REGISTRAR_AUTORIZACAO);
  const id = exigirId(estornoId, 'ESTORNO_ID_INVALIDO');
  const dados = validarDadosExternos(payload);
  if (mesmaConta(dados.autorizadorId, actor.id)) {
    throw new AppError('Quem registra a autorizacao externa nao pode se informar como autorizador', 403, 'AUTOAUTORIZACAO_PROIBIDA');
  }

  return runTransaction(async (tx) => {
    const estorno = await obterEstorno(tx, id, scope);
    recusarPorStatus(estorno, 'autorizar');
    if (mesmaConta(estorno.solicitado_por, dados.autorizadorId)) {
      throw new AppError('Quem solicitou o estorno nao pode autoriza-lo', 403, 'AUTOAPROVACAO_PROIBIDA');
    }
    const autorizador = await contaAutorizadora(tx, dados.autorizadorId, scope);
    if (!autorizador || !roleHasPermission(autorizador.papel, PERMISSIONS.PAGAMENTOS_ESTORNO_APROVAR)) {
      throw new AppError('Autorizador sem permissao de aprovar estorno de pagamento nesta unidade', 422, 'AUTORIZADOR_SEM_PERMISSAO', { autorizador_id: dados.autorizadorId });
    }
    const pagamento = await obterPagamento(tx, estorno.pagamento_id, scope);
    exigirPagamentoAtivo(pagamento);
    const instanteRegistro = new Date();
    const minuto = (instante) => Math.floor(instante.getTime() / 60000);
    if (minuto(dados.autorizadoEm) > minuto(instanteRegistro)) {
      throw new AppError('A data da autorizacao nao pode ser posterior ao registro', 400, 'DATA_AUTORIZACAO_INVALIDA', { motivo: 'futura' });
    }
    const dataPagamento = String(pagamento.data_pagamento || '').slice(0, 10);
    if (dataPagamento && dataLocal.dataLocalISO(dados.autorizadoEm) < dataPagamento) {
      throw new AppError('A data da autorizacao e anterior ao pagamento', 400, 'DATA_AUTORIZACAO_INVALIDA', { motivo: 'anterior_ao_pagamento' });
    }

    const agora = instanteRegistro.toISOString();
    const r = await tx.run(
      `UPDATE pagamento_estorno
       SET status = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_por_papel = ?, aprovado_em = ?,
           autorizacao_canal = ?, autorizacao_referencia = ?,
           autorizacao_registrada_por = ?, autorizacao_registrada_por_nome = ?, autorizacao_registrada_por_papel = ?,
           autorizacao_registrada_em = ?
       WHERE id = ? AND status = ?`,
      [STATUS.APROVADA, String(autorizador.id), autorizador.nome || autorizador.login, autorizador.papel, dados.autorizadoEm.toISOString(),
        dados.canal, dados.referencia, String(actor.id), actor.name || null, actor.role, agora, id, STATUS.SOLICITADA]
    );
    if (r.changes !== 1) throw new AppError('Solicitacao mudou de estado', 409, 'ESTORNO_STATUS_ALTERADO');
    const depois = await tx.get('SELECT * FROM pagamento_estorno WHERE id = ?', [id]);
    await auditoria(tx, {
      actor, action: 'registrar_autorizacao_externa_estorno_pagamento', estornoId: id, before: estorno, after: depois, scope,
      metadata: {
        pagamento_id: estorno.pagamento_id,
        canal: dados.canal,
        referencia: dados.referencia,
        declarada_pelo_operador: true,
        solicitante: { id: estorno.solicitado_por, em: estorno.solicitado_em },
        autorizador: { id: String(autorizador.id), papel: autorizador.papel, em: dados.autorizadoEm.toISOString(), em_informado: dados.autorizadoEmInformado },
        registrado_por: { id: String(actor.id), papel: actor.role, em: agora },
      },
    });
    return depois;
  });
}

// Devolucao por meio no valor integral do pagamento.
function validarDevolucao(payload, pagamento) {
  const original = pagamento.forma_pagamento || null;
  const total = centavos(pagamento.valor_pago);
  const lista = payload.devolucoes;
  if (lista === undefined || lista === null) {
    if (!original) return { itens: null, original, alternativo: null, motivo: null, comprovante: null };
    throw new AppError('Informe o que foi devolvido ao aluno, por meio', 422, 'DEVOLUCAO_OBRIGATORIA', {
      sugestao: [{ meio: original, valor: deCentavos(total) }],
    });
  }
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 10) {
    throw new AppError('Informe os valores devolvidos por meio', 400, 'DEVOLUCAO_OBRIGATORIA');
  }
  const itens = lista.map((item, indice) => {
    const meio = String(item?.meio || '').trim();
    if (!MEIOS_VALORES.includes(meio)) {
      throw new AppError(`Meio de devolucao invalido: use ${MEIOS_VALORES.join(', ')}`, 400, 'PAGAMENTO_MEIO_INVALIDO', { indice, meio: item?.meio ?? null });
    }
    const bruto = item?.valor;
    const c = typeof bruto === 'number' || typeof bruto === 'string' ? paraCentavos(bruto) : null;
    if (!Number.isInteger(c) || c <= 0) {
      throw new AppError('Valor devolvido deve ser positivo, com no maximo duas casas decimais', 400, 'PAGAMENTO_VALOR_INVALIDO', { indice, valor: bruto ?? null });
    }
    return { meio, centavos: c };
  });
  if (payload.devolucao_confirmada !== true) {
    throw new AppError('Confirme que a devolucao ao aluno foi feita antes de executar', 422, 'DEVOLUCAO_NAO_CONFIRMADA');
  }
  const informado = itens.reduce((s, i) => s + i.centavos, 0);
  if (informado !== total) {
    throw new AppError('O estorno e integral: os valores devolvidos devem somar o valor do pagamento', 422, 'DEVOLUCAO_DIFERENTE_DO_TOTAL', {
      total: deCentavos(total), informado: deCentavos(informado),
    });
  }
  const texto = (v) => String(v ?? '').trim();
  const motivo = texto(payload.motivo_troca_meio) || null;
  const comprovante = texto(payload.comprovante_referencia) || null;
  if (comprovante && comprovante.length > 500) throw new AppError('Referencia do comprovante muito longa', 400, 'COMPROVANTE_INVALIDO');
  const alternativo = original ? !(itens.length >= 1 && itens.every((i) => i.meio === original)) : null;
  if (alternativo) {
    if (!motivo || motivo.length < 3) throw new AppError('Informe o motivo da devolucao em outro meio', 422, 'MOTIVO_TROCA_MEIO_OBRIGATORIO');
    if (!comprovante || comprovante.length < 3) throw new AppError('Informe a referencia do comprovante da devolucao', 422, 'COMPROVANTE_OBRIGATORIO');
  }
  return { itens, original, alternativo, motivo: alternativo ? motivo : null, comprovante };
}

async function executar(estornoId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.PAGAMENTOS_ESTORNO_EXECUTAR);
  const id = exigirId(estornoId, 'ESTORNO_ID_INVALIDO');
  // Import tardio: evita ciclo de require com MensalidadeService.
  const MensalidadeService = require('./MensalidadeService');

  return runTransaction(async (tx) => {
    const estorno = await obterEstorno(tx, id, scope);
    recusarPorStatus(estorno, 'executar');
    const contasDistintas = await exigeContasDistintas(tx, scope);
    if (contasDistintas && (mesmaConta(estorno.solicitado_por, actor.id) || mesmaConta(estorno.aprovado_por, actor.id))) {
      throw new AppError('Esta unidade exige solicitante, autorizador e executor distintos', 403, 'CONTAS_DISTINTAS_EXIGIDAS');
    }
    const pagamento = await obterPagamento(tx, estorno.pagamento_id, scope);
    exigirPagamentoAtivo(pagamento);
    const mensalidade = await obterMensalidade(tx, pagamento, scope);
    if (mensalidade.reversao_controlada_id) {
      throw new AppError('Mensalidade ja possui reversao controlada', 409, 'MENSALIDADE_JA_REVERTIDA');
    }
    const devolucao = validarDevolucao(payload, pagamento);

    // Receita original do pagamento (ou o agregado legado da mensalidade).
    const lancamento = pagamento.lancamento_id
      ? await tx.get(
        "SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ? AND tipo = 'receita' AND deleted_at IS NULL",
        [pagamento.lancamento_id, scope.tenant_id, scope.unit_id]
      )
      : await tx.get(
        `SELECT * FROM conta_financeira
         WHERE origem = 'mensalidade' AND origem_id = ? AND tenant_id = ? AND unit_id = ? AND tipo = 'receita' AND deleted_at IS NULL
         ORDER BY id LIMIT 1`,
        [mensalidade.id, scope.tenant_id, scope.unit_id]
      );
    if (!lancamento) {
      throw new AppError(
        'O pagamento nao tem lancamento de receita original ativo nesta unidade. Concilie no Financeiro antes de executar o estorno; a aprovacao continua valida.',
        409,
        'PAGAMENTO_SEM_RECEITA_ORIGINAL',
        { pagamento_id: pagamento.id, estorno_id: id, acao_necessaria: 'conciliacao' }
      );
    }

    // Periodos: mes do pagamento, mes do lancamento original quando diferente
    // e mes do estorno (data operacional da unidade).
    const dataEstorno = dataLocal.dataLocalISO();
    const dataPagamento = String(pagamento.data_pagamento || dataEstorno).slice(0, 10);
    const datas = [[dataPagamento, 'estorno de pagamento (mes do pagamento)']];
    if (lancamento.data_lancamento && mesDe(lancamento.data_lancamento) !== mesDe(dataPagamento)) {
      datas.push([lancamento.data_lancamento, 'estorno de pagamento (mes do lancamento original)']);
    }
    datas.push([dataEstorno, 'estorno de pagamento (mes do estorno)']);
    for (const [data, operacao] of datas) {
      await FechamentoMensalService.assertPeriodoEditavelPorData(data, operacao, tx, scope);
    }

    const saldoAntes = await MensalidadeService.resumoSaldoMensalidade(tx, mensalidade);

    // Consome a aprovacao: so uma execucao passa daqui.
    const agora = new Date().toISOString();
    const consumo = await tx.run(
      `UPDATE pagamento_estorno
       SET status = ?, executado_por = ?, executado_por_nome = ?, executado_por_papel = ?, executado_em = ?,
           data_operacao = ?, contas_distintas_exigidas = ?
       WHERE id = ? AND status = ?`,
      [STATUS.EXECUTADA, String(actor.id), actor.name || null, actor.role, agora, dataEstorno, contasDistintas ? 1 : 0, id, STATUS.APROVADA]
    );
    if (consumo.changes !== 1) throw new AppError('Aprovacao ja consumida', 409, 'ESTORNO_JA_EXECUTADO');

    const responsavel = { ...actor, tenant_id: scope.tenant_id, unit_id: scope.unit_id };
    const valor = deCentavos(centavos(pagamento.valor_pago));
    const reversao = await ReversaoControladaService.inserirRegistroReversao(tx, {
      modulo: 'pagamentos',
      tipo: 'pagamento_mensalidade',
      registroId: pagamento.id,
      motivo: estorno.motivo,
      actor: responsavel,
      metadata: {
        pagamento_estorno_id: id,
        pagamento_id: pagamento.id,
        mensalidade_id: mensalidade.id,
        valor_estornado: valor,
        lancamento_id: lancamento.id,
        solicitado_por: estorno.solicitado_por,
        autorizado_por: estorno.aprovado_por,
        autorizacao_canal: estorno.autorizacao_canal,
      },
    });
    const lancamentoInverso = await ReversaoControladaService.criarLancamentoInverso(tx, {
      reversao,
      lancamento: { ...lancamento, valor },
      descricao: `Estorno do pagamento ${pagamento.id} da mensalidade ${mensalidade.id}`,
      dataLancamento: dataEstorno,
    });

    const marca = await tx.run(
      `UPDATE pagamento SET estornado_em = datetime('now'), estornado_por = ?, reversao_controlada_id = ?
       WHERE id = ? AND estornado_em IS NULL`,
      [actor.id, reversao.id, pagamento.id]
    );
    if (marca.changes !== 1) throw new AppError('Pagamento ja estornado', 409, 'PAGAMENTO_JA_ESTORNADO');

    const saldoDepois = await MensalidadeService.resumoSaldoMensalidade(tx, mensalidade);
    const novoStatus = MensalidadeService.statusPorSaldo(saldoDepois.valorCobradoCentavos, saldoDepois.pagoCentavos, mensalidade.status);
    await tx.run('UPDATE mensalidade SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [novoStatus, mensalidade.id]);

    if (devolucao.itens) {
      for (const item of devolucao.itens) {
        await tx.run(
          `INSERT INTO pagamento_devolucao
            (tenant_id, unit_id, pagamento_id, pagamento_estorno_id, meio, valor_centavos, comprovante_referencia,
             registrado_por, registrado_por_nome, registrado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [scope.tenant_id, scope.unit_id, pagamento.id, id, item.meio, item.centavos, devolucao.comprovante,
            String(actor.id), actor.name || null, agora]
        );
      }
    }
    await tx.run(
      `UPDATE pagamento_estorno
       SET reversao_controlada_id = ?, lancamento_inverso_id = ?, status_mensalidade_depois = ?,
           devolucao_meio_alternativo = ?, devolucao_motivo = ?, devolucao_comprovante = ?, devolucao_confirmada_em = ?
       WHERE id = ?`,
      [reversao.id, lancamentoInverso?.id || null, novoStatus,
        devolucao.alternativo === null ? null : (devolucao.alternativo ? 1 : 0), devolucao.motivo, devolucao.comprovante,
        devolucao.itens ? agora : null, id]
    );

    // Reavaliacao do acesso com o novo saldo (mesma regra da catraca).
    const acesso = await AccessService.avaliarAcessoAluno(mensalidade.aluno_id, { scope });

    const estornoDepois = await tx.get('SELECT * FROM pagamento_estorno WHERE id = ?', [id]);
    const pagamentoDepois = await tx.get('SELECT * FROM pagamento WHERE id = ?', [pagamento.id]);
    const mensalidadeDepois = await tx.get('SELECT * FROM mensalidade WHERE id = ?', [mensalidade.id]);
    const saldo = {
      valor_cobrado: saldoDepois.valor_cobrado,
      total_pago: saldoDepois.total_pago,
      saldo_em_aberto: saldoDepois.saldo_em_aberto,
    };

    await auditoria(tx, {
      actor: responsavel, action: 'executar_estorno_pagamento', estornoId: id, scope,
      before: { estorno, pagamento, mensalidade, saldo: { total_pago: saldoAntes.total_pago, saldo_em_aberto: saldoAntes.saldo_em_aberto } },
      after: { estorno: estornoDepois, pagamento: pagamentoDepois, mensalidade: mensalidadeDepois, lancamento_inverso: lancamentoInverso, saldo },
      metadata: {
        pagamento_id: pagamento.id,
        mensalidade_id: mensalidade.id,
        aluno_id: mensalidade.aluno_id,
        motivo: estorno.motivo,
        valor_estornado: valor,
        data_estorno: dataEstorno,
        data_pagamento: dataPagamento,
        status_mensalidade: { antes: mensalidade.status, depois: novoStatus },
        acesso_reavaliado: { liberado: Boolean(acesso?.ok), status: acesso?.status || null, motivo: acesso?.motivo || null },
        contas_distintas_exigidas: contasDistintas,
        solicitante: { id: estorno.solicitado_por, papel: estorno.solicitado_por_papel, em: estorno.solicitado_em },
        autorizador: {
          id: estorno.aprovado_por,
          papel: estorno.aprovado_por_papel,
          em: estorno.aprovado_em,
          canal: estorno.autorizacao_canal,
          referencia: estorno.autorizacao_referencia,
          declarada_pelo_operador: estorno.autorizacao_canal !== CANAL_SISTEMA,
        },
        registrado_por: estorno.autorizacao_registrada_por
          ? { id: estorno.autorizacao_registrada_por, papel: estorno.autorizacao_registrada_por_papel, em: estorno.autorizacao_registrada_em }
          : null,
        executor: { id: String(actor.id), papel: actor.role, em: agora },
        devolucao: devolucao.itens
          ? {
            itens: devolucao.itens.map((d) => ({ meio: d.meio, valor: deCentavos(d.centavos) })),
            meio_original: devolucao.original,
            meio_alternativo: devolucao.alternativo,
            motivo_troca_meio: devolucao.motivo,
            comprovante_referencia: devolucao.comprovante,
            confirmada_pelo_operador: true,
          }
          : null,
      },
    });

    return {
      estorno: estornoDepois,
      pagamento: pagamentoDepois,
      mensalidade: mensalidadeDepois,
      reversao,
      lancamento_inverso: lancamentoInverso,
      ...saldo,
      status_mensalidade: novoStatus,
      acesso: acesso ? { liberado: Boolean(acesso.ok), status: acesso.status, motivo: acesso.motivo } : null,
    };
  });
}

async function listar(scope, filtros = {}) {
  scope = exigirEscopo(scope);
  const params = [scope.tenant_id, scope.unit_id];
  let where = 'WHERE e.tenant_id = ? AND e.unit_id = ?';
  if (filtros.status) {
    const lista = String(filtros.status).split(',').map((v) => v.trim()).filter((v) => Object.values(STATUS).includes(v));
    if (lista.length) {
      where += ` AND e.status IN (${lista.map(() => '?').join(',')})`;
      params.push(...lista);
    }
  }
  for (const campo of ['pagamento_id', 'mensalidade_id', 'aluno_id']) {
    if (filtros[campo]) {
      where += ` AND e.${campo} = ?`;
      params.push(Number(filtros[campo]));
    }
  }
  const linhas = await runQuery(
    `SELECT e.*, p.data_pagamento, p.valor_pago, p.forma_pagamento, p.estornado_em, m.vencimento, m.valor_cobrado,
            m.status AS status_mensalidade, a.nome AS aluno_nome
     FROM pagamento_estorno e
     JOIN pagamento p ON p.id = e.pagamento_id AND p.tenant_id = e.tenant_id AND p.unit_id = e.unit_id
     JOIN mensalidade m ON m.id = e.mensalidade_id
     LEFT JOIN aluno a ON a.id = e.aluno_id
     ${where}
     ORDER BY e.id DESC
     LIMIT 200`,
    params
  );
  if (!linhas.length) return linhas;
  const devolucoes = await runQuery(
    `SELECT pagamento_estorno_id, meio, valor_centavos, comprovante_referencia FROM pagamento_devolucao
     WHERE tenant_id = ? AND unit_id = ? AND pagamento_estorno_id IN (${linhas.map(() => '?').join(',')}) ORDER BY id`,
    [scope.tenant_id, scope.unit_id, ...linhas.map((l) => l.id)]
  );
  return linhas.map((l) => ({
    ...l,
    devolucoes: devolucoes.filter((d) => d.pagamento_estorno_id === l.id)
      .map((d) => ({ meio: d.meio, rotulo: MEIOS[d.meio] || d.meio, valor: deCentavos(d.valor_centavos), comprovante_referencia: d.comprovante_referencia })),
  }));
}

async function listarAutorizadores(scope, actor) {
  scope = exigirEscopo(scope);
  const papeis = Object.entries(ROLE_PERMISSIONS)
    .filter(([, perms]) => perms.includes(PERMISSIONS.PAGAMENTOS_ESTORNO_APROVAR))
    .map(([papel]) => papel);
  if (!papeis.length) return [];
  return runQuery(
    `SELECT ui.id, ui.nome, ui.papel
     FROM usuario_interno ui
     JOIN usuario_unit uu ON uu.usuario_id = ui.id AND uu.unit_id = ? AND uu.status = ?
     JOIN usuario_tenant ut ON ut.usuario_id = ui.id AND ut.tenant_id = ? AND ut.status = ?
     WHERE ui.status = 'ativo' AND ui.papel IN (${papeis.map(() => '?').join(',')}) AND ui.id != ?
     ORDER BY ui.nome COLLATE NOCASE`,
    [scope.unit_id, USER_SCOPE_STATUS.ATIVO, scope.tenant_id, USER_SCOPE_STATUS.ATIVO, ...papeis, Number(actor?.id) || 0]
  );
}

async function obterPolitica(scope) {
  scope = exigirEscopo(scope);
  const rows = await runQuery('SELECT estorno_pagamento_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
  return { contas_distintas: Number(rows[0]?.estorno_pagamento_contas_distintas || 0) === 1 };
}

async function definirPolitica(contasDistintas, actor, scope) {
  scope = exigirEscopo(scope);
  if (typeof contasDistintas !== 'boolean') {
    throw new AppError('Informe contas_distintas como verdadeiro ou falso', 400, 'POLITICA_ESTORNO_INVALIDA');
  }
  return runTransaction(async (tx) => {
    const before = await tx.get('SELECT estorno_pagamento_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
    await tx.run('UPDATE unit SET estorno_pagamento_contas_distintas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
      [contasDistintas ? 1 : 0, scope.unit_id, scope.tenant_id]);
    await AuditService.logAction({
      actor,
      action: 'configurar_politica_estorno_pagamento',
      module: 'unidades',
      recordType: 'unit',
      recordId: scope.unit_id,
      before,
      after: { estorno_pagamento_contas_distintas: contasDistintas ? 1 : 0 },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);
    return { contas_distintas: contasDistintas };
  });
}

module.exports = {
  MEIOS,
  MEIOS_VALORES,
  normalizarMeioPagamento,
  solicitar,
  aprovar,
  registrarAutorizacaoExterna,
  executar,
  listar,
  listarAutorizadores,
  obterPolitica,
  definirPolitica,
};
