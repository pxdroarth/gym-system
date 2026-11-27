// Estorno de baixa de conta financeira (L04, sublote C; decisoes de 20/11 e
// 26/11/2026).
//
// A baixa de uma conta manual (status pendente -> pago) passa a gravar a data
// da baixa (data operacional da unidade), quem baixou e, opcionalmente, o meio.
// Contas pagas antes deste sublote ficam com a data da conta como data da
// baixa, marcada como estimada, e sem meio registrado.
//
// O estorno de baixa devolve a conta a pendente; a conta continua existindo e
// o valor sai do realizado. Segue o modelo do estorno de venda e de pagamento:
// 1. Solicitar com motivo (contas:baixa_estorno_solicitar): financeiro, admin e
//    dono. Um pedido ativo por conta.
// 2. Autorizar: aprovacao direta de admin ou dono (contas:baixa_estorno_aprovar)
//    ou autorizacao externa por WhatsApp ou e-mail registrada por outro
//    operador (contas:baixa_estorno_registrar_autorizacao). Quem solicitou nao
//    autoriza o proprio pedido; quem registra nao se informa como autorizador.
// 3. Executar (contas:baixa_estorno_executar): financeiro, admin e dono, com
//    aprovacao valida. A unidade pode exigir tres contas distintas
//    (unit.estorno_baixa_contas_distintas).
// O mes da conta e o mes da baixa precisam estar abertos. Consumo da aprovacao,
// volta a pendente e auditoria ficam numa unica transacao.
const { runQuery, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const dataLocal = require('../utils/dataLocal');
const { paraCentavos, deCentavos } = require('../utils/dinheiro');
const { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const { USER_SCOPE_STATUS } = require('../constants/scope');
const { comum } = require('./EstornoVendaService');

const {
  STATUS, CANAL_SISTEMA, exigirEscopo, exigirPermissao, exigirId, mesmaConta, mesDe,
  recusarPorStatus, contaAutorizadora, validarDadosExternos,
} = comum;

const MEIOS_BAIXA = Object.freeze({
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
});
const MEIOS_BAIXA_VALORES = Object.freeze(Object.keys(MEIOS_BAIXA));

function normalizarMeioBaixa(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const meio = String(valor).trim();
  if (!MEIOS_BAIXA_VALORES.includes(meio)) {
    throw new AppError(`Meio da baixa invalido: use ${MEIOS_BAIXA_VALORES.join(', ')}`, 400, 'BAIXA_MEIO_INVALIDO', { meio: valor });
  }
  return meio;
}

// Dados gravados na conta quando ela passa a paga. Chamado pelas rotas de
// contas financeiras dentro da mesma transacao da troca de status.
function dadosDaBaixa(actor, meio) {
  return {
    data_baixa: dataLocal.dataLocalISO(),
    data_baixa_estimada: 0,
    baixa_meio: normalizarMeioBaixa(meio),
    baixa_por: actor?.id != null ? String(actor.id) : null,
    baixa_por_nome: actor?.name || null,
    baixa_em: new Date().toISOString(),
  };
}

async function gravarBaixa(tx, contaId, actor, meio) {
  const d = dadosDaBaixa(actor, meio);
  await tx.run(
    `UPDATE conta_financeira
     SET data_baixa = ?, data_baixa_estimada = ?, baixa_meio = ?, baixa_por = ?, baixa_por_nome = ?, baixa_em = ?
     WHERE id = ?`,
    [d.data_baixa, d.data_baixa_estimada, d.baixa_meio, d.baixa_por, d.baixa_por_nome, d.baixa_em, contaId]
  );
  return d;
}

const centavos = (valor) => paraCentavos(valor) ?? Math.round(Number(valor || 0) * 100);

const auditoria = (tx, { actor, action, estornoId, before, after, metadata, scope }) => AuditService.logAction({
  actor,
  action,
  module: 'contas_financeiras',
  recordType: 'conta_baixa_estorno',
  recordId: estornoId,
  before,
  after,
  metadata,
  tenant_id: scope.tenant_id,
  unit_id: scope.unit_id,
}, tx);

async function exigeContasDistintas(tx, scope) {
  const unit = await tx.get('SELECT estorno_baixa_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
  return Number(unit?.estorno_baixa_contas_distintas || 0) === 1;
}

async function obterConta(tx, id, scope) {
  const conta = await tx.get('SELECT * FROM conta_financeira WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
  if (!conta || conta.deleted_at) throw new AppError('Conta financeira nao encontrada', 404, 'CONTA_NAO_ENCONTRADA');
  return conta;
}

// So contas manuais pagas e sem reversao: lancamentos derivados (venda,
// mensalidade, pagamento, estorno) seguem o fluxo de origem.
function exigirContaBaixada(conta) {
  if (String(conta.origem || '').trim() !== 'conta_financeira') {
    throw new AppError('Lancamento derivado deve ser estornado pelo fluxo de origem.', 409, 'CONTA_FINANCEIRA_DERIVADA_PROTEGIDA');
  }
  if (conta.reversao_controlada_id) throw new AppError('Conta ja possui reversao controlada', 409, 'CONTA_JA_REVERTIDA');
  if (conta.status !== 'pago') throw new AppError('A conta nao esta baixada (paga)', 409, 'CONTA_NAO_BAIXADA');
}

function dataDaBaixa(conta) {
  const registrada = String(conta.data_baixa || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(registrada)) return { data: registrada, estimada: Number(conta.data_baixa_estimada || 0) === 1 };
  return { data: String(conta.data_lancamento || '').slice(0, 10) || null, estimada: true };
}

async function obterEstorno(tx, id, scope) {
  const estorno = await tx.get('SELECT * FROM conta_baixa_estorno WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
  if (!estorno) throw new AppError('Solicitacao de estorno nao encontrada', 404, 'ESTORNO_NAO_ENCONTRADO');
  return estorno;
}

async function pedidoAtivo(tx, contaId, scope) {
  return tx.get(
    'SELECT * FROM conta_baixa_estorno WHERE conta_id = ? AND tenant_id = ? AND unit_id = ? AND status IN (?, ?) ORDER BY id LIMIT 1',
    [contaId, scope.tenant_id, scope.unit_id, STATUS.SOLICITADA, STATUS.APROVADA]
  );
}

async function solicitar(contaId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.CONTAS_BAIXA_ESTORNO_SOLICITAR);
  const id = exigirId(contaId, 'CONTA_ID_INVALIDO');
  const motivo = String(payload.motivo || '').trim();
  if (!motivo) throw new AppError('Motivo e obrigatorio para solicitar o estorno', 400, 'MOTIVO_OBRIGATORIO');

  return runTransaction(async (tx) => {
    const conta = await obterConta(tx, id, scope);
    exigirContaBaixada(conta);
    const existente = await pedidoAtivo(tx, id, scope);
    if (existente) return { estorno: existente, existente: true };
    const baixa = dataDaBaixa(conta);
    const agora = new Date().toISOString();
    const r = await tx.run(
      `INSERT INTO conta_baixa_estorno
        (tenant_id, unit_id, conta_id, status, motivo, valor, tipo_conta, data_baixa, data_baixa_estimada, baixa_meio,
         solicitado_por, solicitado_por_nome, solicitado_por_papel, solicitado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scope.tenant_id, scope.unit_id, id, STATUS.SOLICITADA, motivo, deCentavos(centavos(conta.valor)), conta.tipo,
        baixa.data, baixa.estimada ? 1 : 0, conta.baixa_meio || null,
        String(actor.id), actor.name || null, actor.role, agora]
    );
    const estorno = await tx.get('SELECT * FROM conta_baixa_estorno WHERE id = ?', [r.lastID]);
    await auditoria(tx, {
      actor, action: 'solicitar_estorno_baixa_conta', estornoId: estorno.id, before: null, after: estorno, scope,
      metadata: { conta_id: id, motivo, solicitante: { id: String(actor.id), papel: actor.role, em: agora } },
    });
    return { estorno, existente: false };
  });
}

async function aprovar(estornoId, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.CONTAS_BAIXA_ESTORNO_APROVAR);
  const id = exigirId(estornoId, 'ESTORNO_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const estorno = await obterEstorno(tx, id, scope);
    recusarPorStatus(estorno, 'autorizar');
    if (mesmaConta(estorno.solicitado_por, actor.id)) {
      throw new AppError('Quem solicitou o estorno nao pode aprova-lo', 403, 'AUTOAPROVACAO_PROIBIDA');
    }
    exigirContaBaixada(await obterConta(tx, estorno.conta_id, scope));
    const agora = new Date().toISOString();
    const r = await tx.run(
      `UPDATE conta_baixa_estorno
       SET status = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_por_papel = ?, aprovado_em = ?, autorizacao_canal = ?
       WHERE id = ? AND status = ?`,
      [STATUS.APROVADA, String(actor.id), actor.name || null, actor.role, agora, CANAL_SISTEMA, id, STATUS.SOLICITADA]
    );
    if (r.changes !== 1) throw new AppError('Solicitacao mudou de estado', 409, 'ESTORNO_STATUS_ALTERADO');
    const depois = await tx.get('SELECT * FROM conta_baixa_estorno WHERE id = ?', [id]);
    await auditoria(tx, {
      actor, action: 'aprovar_estorno_baixa_conta', estornoId: id, before: estorno, after: depois, scope,
      metadata: {
        conta_id: estorno.conta_id,
        canal: CANAL_SISTEMA,
        solicitante: { id: estorno.solicitado_por, em: estorno.solicitado_em },
        autorizador: { id: String(actor.id), papel: actor.role, em: agora },
      },
    });
    return depois;
  });
}

// Autorizacao externa: data entre o dia da baixa (data civil) e o minuto do registro.
async function registrarAutorizacaoExterna(estornoId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.CONTAS_BAIXA_ESTORNO_REGISTRAR_AUTORIZACAO);
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
    if (!autorizador || !roleHasPermission(autorizador.papel, PERMISSIONS.CONTAS_BAIXA_ESTORNO_APROVAR)) {
      throw new AppError('Autorizador sem permissao de aprovar estorno de baixa nesta unidade', 422, 'AUTORIZADOR_SEM_PERMISSAO', { autorizador_id: dados.autorizadorId });
    }
    const conta = await obterConta(tx, estorno.conta_id, scope);
    exigirContaBaixada(conta);
    const instanteRegistro = new Date();
    const minuto = (instante) => Math.floor(instante.getTime() / 60000);
    if (minuto(dados.autorizadoEm) > minuto(instanteRegistro)) {
      throw new AppError('A data da autorizacao nao pode ser posterior ao registro', 400, 'DATA_AUTORIZACAO_INVALIDA', { motivo: 'futura' });
    }
    const { data: dataBaixa } = dataDaBaixa(conta);
    if (dataBaixa && dataLocal.dataLocalISO(dados.autorizadoEm) < dataBaixa) {
      throw new AppError('A data da autorizacao e anterior a baixa', 400, 'DATA_AUTORIZACAO_INVALIDA', { motivo: 'anterior_a_baixa' });
    }

    const agora = instanteRegistro.toISOString();
    const r = await tx.run(
      `UPDATE conta_baixa_estorno
       SET status = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_por_papel = ?, aprovado_em = ?,
           autorizacao_canal = ?, autorizacao_referencia = ?,
           autorizacao_registrada_por = ?, autorizacao_registrada_por_nome = ?, autorizacao_registrada_por_papel = ?,
           autorizacao_registrada_em = ?
       WHERE id = ? AND status = ?`,
      [STATUS.APROVADA, String(autorizador.id), autorizador.nome || autorizador.login, autorizador.papel, dados.autorizadoEm.toISOString(),
        dados.canal, dados.referencia, String(actor.id), actor.name || null, actor.role, agora, id, STATUS.SOLICITADA]
    );
    if (r.changes !== 1) throw new AppError('Solicitacao mudou de estado', 409, 'ESTORNO_STATUS_ALTERADO');
    const depois = await tx.get('SELECT * FROM conta_baixa_estorno WHERE id = ?', [id]);
    await auditoria(tx, {
      actor, action: 'registrar_autorizacao_externa_estorno_baixa_conta', estornoId: id, before: estorno, after: depois, scope,
      metadata: {
        conta_id: estorno.conta_id,
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

async function executar(estornoId, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.CONTAS_BAIXA_ESTORNO_EXECUTAR);
  const id = exigirId(estornoId, 'ESTORNO_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const estorno = await obterEstorno(tx, id, scope);
    recusarPorStatus(estorno, 'executar');
    const contasDistintas = await exigeContasDistintas(tx, scope);
    if (contasDistintas && (mesmaConta(estorno.solicitado_por, actor.id) || mesmaConta(estorno.aprovado_por, actor.id))) {
      throw new AppError('Esta unidade exige solicitante, autorizador e executor distintos', 403, 'CONTAS_DISTINTAS_EXIGIDAS');
    }
    const conta = await obterConta(tx, estorno.conta_id, scope);
    exigirContaBaixada(conta);

    // Periodos: mes da conta (o realizado e apurado por ele) e mes da baixa.
    const baixa = dataDaBaixa(conta);
    const datas = [[conta.data_lancamento, 'estorno de baixa de conta (mes da conta)']];
    if (baixa.data && mesDe(baixa.data) !== mesDe(conta.data_lancamento)) {
      datas.push([baixa.data, 'estorno de baixa de conta (mes da baixa)']);
    }
    for (const [data, operacao] of datas) {
      await FechamentoMensalService.assertPeriodoEditavelPorData(data, operacao, tx, scope);
    }

    const agora = new Date().toISOString();
    const dataEstorno = dataLocal.dataLocalISO();
    const consumo = await tx.run(
      `UPDATE conta_baixa_estorno
       SET status = ?, executado_por = ?, executado_por_nome = ?, executado_por_papel = ?, executado_em = ?,
           data_operacao = ?, contas_distintas_exigidas = ?
       WHERE id = ? AND status = ?`,
      [STATUS.EXECUTADA, String(actor.id), actor.name || null, actor.role, agora, dataEstorno, contasDistintas ? 1 : 0, id, STATUS.APROVADA]
    );
    if (consumo.changes !== 1) throw new AppError('Aprovacao ja consumida', 409, 'ESTORNO_JA_EXECUTADO');

    const volta = await tx.run(
      `UPDATE conta_financeira
       SET status = 'pendente', pago = 0, data_baixa = NULL, data_baixa_estimada = NULL, baixa_meio = NULL,
           baixa_por = NULL, baixa_por_nome = NULL, baixa_em = NULL, updated_at = datetime('now')
       WHERE id = ? AND status = 'pago' AND reversao_controlada_id IS NULL`,
      [conta.id]
    );
    if (volta.changes !== 1) throw new AppError('A conta nao esta baixada (paga)', 409, 'CONTA_NAO_BAIXADA');

    const estornoDepois = await tx.get('SELECT * FROM conta_baixa_estorno WHERE id = ?', [id]);
    const contaDepois = await tx.get('SELECT * FROM conta_financeira WHERE id = ?', [conta.id]);
    const responsavel = { ...actor, tenant_id: scope.tenant_id, unit_id: scope.unit_id };
    await auditoria(tx, {
      actor: responsavel, action: 'executar_estorno_baixa_conta', estornoId: id, scope,
      before: { estorno, conta },
      after: { estorno: estornoDepois, conta: contaDepois },
      metadata: {
        conta_id: conta.id,
        motivo: estorno.motivo,
        valor: deCentavos(centavos(conta.valor)),
        tipo_conta: conta.tipo,
        data_conta: conta.data_lancamento,
        baixa: { data: baixa.data, estimada: baixa.estimada, meio: conta.baixa_meio || null, por: conta.baixa_por || null },
        data_estorno: dataEstorno,
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
      },
    });
    return { estorno: estornoDepois, conta: contaDepois };
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
  if (filtros.conta_id) {
    where += ' AND e.conta_id = ?';
    params.push(Number(filtros.conta_id));
  }
  return runQuery(
    `SELECT e.*, c.descricao AS conta_descricao, c.data_lancamento AS conta_data, c.status AS conta_status
     FROM conta_baixa_estorno e
     JOIN conta_financeira c ON c.id = e.conta_id AND c.tenant_id = e.tenant_id AND c.unit_id = e.unit_id
     ${where}
     ORDER BY e.id DESC
     LIMIT 200`,
    params
  );
}

async function listarAutorizadores(scope, actor) {
  scope = exigirEscopo(scope);
  const papeis = Object.entries(ROLE_PERMISSIONS)
    .filter(([, perms]) => perms.includes(PERMISSIONS.CONTAS_BAIXA_ESTORNO_APROVAR))
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
  const rows = await runQuery('SELECT estorno_baixa_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
  return { contas_distintas: Number(rows[0]?.estorno_baixa_contas_distintas || 0) === 1 };
}

async function definirPolitica(contasDistintas, actor, scope) {
  scope = exigirEscopo(scope);
  if (typeof contasDistintas !== 'boolean') {
    throw new AppError('Informe contas_distintas como verdadeiro ou falso', 400, 'POLITICA_ESTORNO_INVALIDA');
  }
  return runTransaction(async (tx) => {
    const before = await tx.get('SELECT estorno_baixa_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
    await tx.run('UPDATE unit SET estorno_baixa_contas_distintas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
      [contasDistintas ? 1 : 0, scope.unit_id, scope.tenant_id]);
    await AuditService.logAction({
      actor,
      action: 'configurar_politica_estorno_baixa_conta',
      module: 'unidades',
      recordType: 'unit',
      recordId: scope.unit_id,
      before,
      after: { estorno_baixa_contas_distintas: contasDistintas ? 1 : 0 },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);
    return { contas_distintas: contasDistintas };
  });
}

module.exports = {
  MEIOS_BAIXA,
  MEIOS_BAIXA_VALORES,
  normalizarMeioBaixa,
  gravarBaixa,
  solicitar,
  aprovar,
  registrarAutorizacaoExterna,
  executar,
  listar,
  listarAutorizadores,
  obterPolitica,
  definirPolitica,
};
