// Estorno de venda (L04, DN-3 ajustada em 12/11/2026).
//
// Fluxo padrao da unidade:
// 1. Solicitar, com motivo (vendas:estorno_solicitar): atendente (recepcao),
//    gestor, financeiro, admin e dono. Um unico pedido ativo por venda; reenvio
//    ou solicitacao concorrente devolve o pedido existente sem alterar seu estado.
// 2. Autorizar, por um de dois caminhos:
//    a. aprovacao direta no sistema (vendas:estorno_aprovar): gestor, admin e
//       dono da unidade. Quem solicitou nao aprova o proprio pedido, mesmo
//       depois de mudar de papel (comparacao pelo id da conta);
//    b. autorizacao externa (WhatsApp ou e-mail) declarada por um operador
//       (vendas:estorno_registrar_autorizacao): informa quem autorizou (conta
//       ativa da unidade com permissao de aprovar), o canal, a data e uma
//       referencia da mensagem. O operador nunca informa a propria conta como
//       autorizadora, e o autorizador nunca e o solicitante.
// 3. Executar (vendas:estorno_executar): atendente, financeiro, admin e dono,
//    com aprovacao valida. A mesma conta pode solicitar, registrar a
//    autorizacao de outro gestor e executar.
//
// Opcao da unidade (unit.estorno_venda_contas_distintas = 1): solicitante,
// autorizador e executor precisam ser tres contas distintas, inclusive com
// autorizacao externa. A conta que registrou a autorizacao externa fica
// registrada a parte.
//
// Solicitar e autorizar funcionam com periodo fechado. Na execucao, o mes da
// venda, o mes da contrapartida (data operacional da unidade) e, se diferente,
// o mes do lancamento de receita original precisam estar abertos; com 423 a
// aprovacao continua valida. O valor e estornado integralmente e so a
// quantidade confirmada em condicao de revenda volta ao estoque. Contrapartida,
// reposicao, estado da venda, consumo da aprovacao e auditoria acontecem numa
// unica transacao. Venda sem lancamento de receita original ativo no escopo
// nao e executada (409 VENDA_SEM_RECEITA_ORIGINAL): exige conciliacao e a
// aprovacao continua valida.
//
// Autorizacao externa: data de calendario valida, informada em horas e
// minutos no fuso da unidade; vale do minuto da venda (ou do inicio da data
// civil, em venda legada sem hora) ate o minuto do registro (veja
// conferirJanelaDaAutorizacao).
const { runQuery, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const ReversaoControladaService = require('./ReversaoControladaService');
const dataLocal = require('../utils/dataLocal');
const { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const { USER_SCOPE_STATUS, UNIT_STATUS, TENANT_STATUS } = require('../constants/scope');

const STATUS = Object.freeze({
  SOLICITADA: 'solicitada',
  APROVADA: 'aprovada',
  EXECUTADA: 'executada',
  ENCERRADA: 'encerrada',
});

const CANAIS_EXTERNOS = Object.freeze(['whatsapp', 'email']);
const CANAL_SISTEMA = 'sistema';

function exigirEscopo(scope) {
  if (!scope?.tenant_id || !scope?.unit_id) {
    throw new AppError('Escopo de rede/unidade obrigatorio para estorno de venda', 403, 'ESCOPO_OBRIGATORIO');
  }
  return { tenant_id: Number(scope.tenant_id), unit_id: Number(scope.unit_id) };
}

function exigirPermissao(actor, permission) {
  if (!actor?.id || !actor?.role) {
    throw new AppError('Operador nao resolvido para esta acao', 401, 'OPERADOR_NAO_RESOLVIDO');
  }
  if (!roleHasPermission(actor.role, permission)) {
    throw new AppError('Permissao negada para esta etapa do estorno', 403, 'PERMISSAO_NEGADA', { permission, papel: actor.role });
  }
  return actor;
}

function exigirId(valor, codigo) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('Identificador invalido', 400, codigo);
  return id;
}

const mesmaConta = (a, b) => a != null && b != null && String(a) === String(b);

// data_venda e gravada pelo SQLite em UTC ('AAAA-MM-DD HH:MM:SS'). A data
// operacional da venda e a data civil desse instante no fuso da unidade.
function instanteUtc(valor) {
  const texto = String(valor || '').trim();
  const m = texto.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/i);
  return m ? new Date(`${m[1]}T${m[2]}${m[3] || 'Z'}`) : null;
}

function dataOperacionalDaVenda(valor) {
  const texto = String(valor || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const instante = instanteUtc(texto);
  if (!instante || Number.isNaN(instante.getTime())) {
    throw new AppError('Data da venda invalida para estorno', 409, 'VENDA_DATA_INVALIDA');
  }
  return dataLocal.dataLocalISO(instante);
}

const mesDe = (data) => String(data).slice(0, 7);

async function exigeContasDistintas(tx, scope) {
  const unit = await tx.get('SELECT estorno_venda_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
  return Number(unit?.estorno_venda_contas_distintas || 0) === 1;
}

async function obterVenda(tx, id, scope) {
  const venda = await tx.get(
    'SELECT * FROM venda_produto WHERE id = ? AND tenant_id = ? AND unit_id = ? AND deleted_at IS NULL',
    [id, scope.tenant_id, scope.unit_id]
  );
  if (!venda) throw new AppError('Venda nao encontrada', 404, 'VENDA_NAO_ENCONTRADA');
  return venda;
}

async function obterEstorno(tx, id, scope) {
  const estorno = await tx.get(
    'SELECT * FROM venda_estorno WHERE id = ? AND tenant_id = ? AND unit_id = ?',
    [id, scope.tenant_id, scope.unit_id]
  );
  if (!estorno) throw new AppError('Solicitacao de estorno nao encontrada', 404, 'ESTORNO_NAO_ENCONTRADO');
  return estorno;
}

function recusarPorStatus(estorno, etapa) {
  if (estorno.status === STATUS.EXECUTADA) {
    throw new AppError('Estorno ja executado', 409, 'ESTORNO_JA_EXECUTADO', { estorno_id: estorno.id });
  }
  if (estorno.status === STATUS.ENCERRADA) {
    throw new AppError('Solicitacao encerrada', 409, 'ESTORNO_ENCERRADO', { estorno_id: estorno.id });
  }
  if (etapa === 'autorizar' && estorno.status === STATUS.APROVADA) {
    throw new AppError('Solicitacao ja autorizada', 409, 'ESTORNO_JA_APROVADO', { estorno_id: estorno.id });
  }
  if (etapa === 'executar' && estorno.status === STATUS.SOLICITADA) {
    throw new AppError('O estorno precisa de aprovacao antes da execucao', 409, 'REVERSAO_APROVACAO_NECESSARIA', { estorno_id: estorno.id });
  }
}

// Conta que pode autorizar estorno nesta unidade: ativa, com vinculo ativo na
// unidade e na Rede, e com papel que tem vendas:estorno_aprovar.
async function contaAutorizadora(tx, usuarioId, scope) {
  return tx.get(
    `SELECT ui.id, ui.nome, ui.login, ui.papel
     FROM usuario_interno ui
     JOIN usuario_unit uu ON uu.usuario_id = ui.id AND uu.unit_id = ? AND uu.status = ?
     JOIN unit u ON u.id = uu.unit_id AND u.tenant_id = ? AND u.status = ?
     JOIN tenant t ON t.id = u.tenant_id AND t.status = ?
     JOIN usuario_tenant ut ON ut.usuario_id = ui.id AND ut.tenant_id = u.tenant_id AND ut.status = ?
     WHERE ui.id = ? AND ui.status = 'ativo'`,
    [scope.unit_id, USER_SCOPE_STATUS.ATIVO, scope.tenant_id, UNIT_STATUS.ATIVA, TENANT_STATUS.ATIVO, USER_SCOPE_STATUS.ATIVO, usuarioId]
  );
}

// Itens confirmados na execucao: um por item da venda (hoje a venda tem um
// item). Quantidade inteira recebida em condicao de revenda, de 0 ao vendido.
function validarItens(itens, venda) {
  const vendida = Number(venda.quantidade || 0);
  if (!Array.isArray(itens) || itens.length !== 1) {
    throw new AppError('Informe a quantidade recebida em condicao de venda para o item da venda', 400, 'QUANTIDADE_REPOSTA_INVALIDA', {
      itens_esperados: [{ produto_id: venda.produto_id, quantidade_vendida: vendida }],
    });
  }
  const [item] = itens;
  const produtoId = Number(item?.produto_id);
  const quantidade = item?.quantidade_reposta;
  if (produtoId !== Number(venda.produto_id)) {
    throw new AppError('Item nao pertence a venda', 400, 'QUANTIDADE_REPOSTA_INVALIDA', { produto_id: item?.produto_id });
  }
  if (typeof quantidade !== 'number' || !Number.isInteger(quantidade) || quantidade < 0 || quantidade > vendida) {
    throw new AppError(`Quantidade recebida deve ser um inteiro de 0 a ${vendida}`, 400, 'QUANTIDADE_REPOSTA_INVALIDA', {
      quantidade_reposta: quantidade ?? null,
      quantidade_vendida: vendida,
    });
  }
  return { produto_id: produtoId, quantidade_vendida: vendida, quantidade_reposta: quantidade };
}

async function pedidoAtivo(tx, vendaId, scope) {
  return tx.get(
    `SELECT * FROM venda_estorno
     WHERE venda_id = ? AND tenant_id = ? AND unit_id = ? AND status IN (?, ?)
     ORDER BY id LIMIT 1`,
    [vendaId, scope.tenant_id, scope.unit_id, STATUS.SOLICITADA, STATUS.APROVADA]
  );
}

async function solicitar(vendaId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.VENDAS_ESTORNO_SOLICITAR);
  const id = exigirId(vendaId, 'VENDA_ID_INVALIDO');
  const motivo = String(payload.motivo || '').trim();
  if (!motivo) throw new AppError('Motivo e obrigatorio para solicitar o estorno', 400, 'MOTIVO_OBRIGATORIO');

  return runTransaction(async (tx) => {
    const venda = await obterVenda(tx, id, scope);
    if (venda.reversao_controlada_id) {
      throw new AppError('Venda ja estornada', 409, 'VENDA_JA_REVERTIDA');
    }
    // Um unico pedido ativo por venda: reenvio ou pedido concorrente recebe o
    // existente, com o estado preservado.
    const existente = await pedidoAtivo(tx, id, scope);
    if (existente) return { estorno: existente, existente: true };

    const agora = new Date().toISOString();
    const result = await tx.run(
      `INSERT INTO venda_estorno
        (tenant_id, unit_id, venda_id, status, motivo, valor_estornado, quantidade_vendida,
         solicitado_por, solicitado_por_nome, solicitado_por_papel, solicitado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scope.tenant_id, scope.unit_id, id, STATUS.SOLICITADA, motivo, Number(venda.valor_total || 0), Number(venda.quantidade || 0),
        String(actor.id), actor.name || null, actor.role, agora]
    );
    const estorno = await tx.get('SELECT * FROM venda_estorno WHERE id = ?', [result.lastID]);
    await AuditService.logAction({
      actor,
      action: 'solicitar_estorno_venda',
      module: 'vendas_produtos',
      recordType: 'venda_estorno',
      recordId: estorno.id,
      before: null,
      after: estorno,
      metadata: { venda_id: id, motivo, solicitante: { id: String(actor.id), papel: actor.role, em: agora } },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);
    return { estorno, existente: false };
  });
}

async function aprovar(estornoId, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.VENDAS_ESTORNO_APROVAR);
  const id = exigirId(estornoId, 'ESTORNO_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const estorno = await obterEstorno(tx, id, scope);
    recusarPorStatus(estorno, 'autorizar');
    if (mesmaConta(estorno.solicitado_por, actor.id)) {
      throw new AppError('Quem solicitou o estorno nao pode aprova-lo', 403, 'AUTOAPROVACAO_PROIBIDA');
    }
    const venda = await obterVenda(tx, estorno.venda_id, scope);
    if (venda.reversao_controlada_id) throw new AppError('Venda ja estornada', 409, 'VENDA_JA_REVERTIDA');

    const agora = new Date().toISOString();
    const r = await tx.run(
      `UPDATE venda_estorno
       SET status = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_por_papel = ?, aprovado_em = ?,
           autorizacao_canal = ?
       WHERE id = ? AND status = ?`,
      [STATUS.APROVADA, String(actor.id), actor.name || null, actor.role, agora, CANAL_SISTEMA, id, STATUS.SOLICITADA]
    );
    if (r.changes !== 1) throw new AppError('Solicitacao mudou de estado', 409, 'ESTORNO_STATUS_ALTERADO');
    const depois = await tx.get('SELECT * FROM venda_estorno WHERE id = ?', [id]);
    await AuditService.logAction({
      actor,
      action: 'aprovar_estorno_venda',
      module: 'vendas_produtos',
      recordType: 'venda_estorno',
      recordId: id,
      before: estorno,
      after: depois,
      metadata: {
        venda_id: estorno.venda_id,
        canal: CANAL_SISTEMA,
        solicitante: { id: estorno.solicitado_por, em: estorno.solicitado_em },
        autorizador: { id: String(actor.id), papel: actor.role, em: agora },
      },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);
    return depois;
  });
}

function validarDadosExternos(payload = {}) {
  const canal = String(payload.canal || '').trim().toLowerCase();
  if (!CANAIS_EXTERNOS.includes(canal)) {
    throw new AppError('Canal da autorizacao deve ser whatsapp ou email', 400, 'CANAL_AUTORIZACAO_INVALIDO');
  }
  const referencia = String(payload.referencia || '').trim();
  if (referencia.length < 3 || referencia.length > 500) {
    throw new AppError('Informe a referencia da mensagem ou do e-mail (3 a 500 caracteres)', 400, 'REFERENCIA_AUTORIZACAO_OBRIGATORIA');
  }
  const texto = String(payload.autorizado_em || '').trim();
  const instante = instanteDaAutorizacao(texto);
  if (!instante) {
    throw new AppError('Data da autorizacao invalida: informe uma data de calendario existente e a hora (AAAA-MM-DDTHH:MM)', 400, 'DATA_AUTORIZACAO_INVALIDA', {
      autorizado_em: texto || null,
    });
  }
  const autorizadorId = Number(payload.autorizador_id);
  if (!Number.isInteger(autorizadorId) || autorizadorId <= 0) {
    throw new AppError('Informe quem autorizou', 400, 'AUTORIZADOR_OBRIGATORIO');
  }
  return { canal, referencia, autorizadoEm: instante, autorizadoEmInformado: texto, autorizadorId };
}

// Data e hora da autorizacao externa. O formulario envia o horario de parede
// da unidade sem segundos ('AAAA-MM-DDTHH:MM', fuso APP_TIMEZONE); clientes da
// API tambem podem enviar ISO com fuso ('...Z' ou '-03:00'). Data de
// calendario inexistente (30/02, 24:00) e recusada.
function instanteDaAutorizacao(texto) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(texto)) {
    return dataLocal.instanteDeHorarioLocal(texto);
  }
  const m = texto.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})$/);
  if (!m) return null;
  // Confere o calendario da parte local antes de aplicar o fuso informado.
  if (!dataLocal.instanteDeHorarioLocal(m[1].slice(0, 19).replace(/\.\d+$/, ''), 'UTC')) return null;
  const instante = new Date(texto);
  return Number.isNaN(instante.getTime()) ? null : instante;
}

// Comparacao em minutos: como o formulario so informa horas e minutos, a
// venda, a autorizacao e o registro sao truncados ao minuto (segundos
// descartados). Vale a autorizacao cujo minuto esta entre o minuto da venda e
// o minuto do registro, inclusive nas duas pontas: uma venda as 10:42:35
// aceita autorizacao informada como 10:42; um registro as 10:50:10 aceita
// ate 10:50 e recusa 10:51.
//
// Venda legada gravada so com a data ('AAAA-MM-DD', sem hora): o limite
// inferior e a data civil da venda no fuso da operacao. Vale autorizacao a
// partir das 00:00 desse dia (data local da autorizacao >= data da venda); o
// historico da venda nao recebe horario. O limite superior continua sendo o
// minuto do registro.
const minutoDe = (instante) => Math.floor(instante.getTime() / 60000);

// Limite inferior da janela a partir de data_venda: { tipo: 'minuto', instante }
// para venda com horario, { tipo: 'data', data } para venda legada so com data.
function limiteInferiorDaVenda(dataVenda) {
  const texto = String(dataVenda || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return { tipo: 'data', data: texto };
  const instante = instanteUtc(texto);
  return instante && !Number.isNaN(instante.getTime()) ? { tipo: 'minuto', instante } : null;
}

// `limiteVenda` aceita o resultado de limiteInferiorDaVenda, um Date (venda
// com horario) ou 'AAAA-MM-DD' (venda legada).
function conferirJanelaDaAutorizacao(autorizadoEm, limiteVenda, instanteRegistro) {
  if (minutoDe(autorizadoEm) > minutoDe(instanteRegistro)) {
    throw new AppError('A data da autorizacao nao pode ser posterior ao registro', 400, 'DATA_AUTORIZACAO_INVALIDA', {
      motivo: 'futura',
    });
  }
  let limite = limiteVenda;
  if (limite instanceof Date) limite = { tipo: 'minuto', instante: limite };
  else if (typeof limite === 'string') limite = limiteInferiorDaVenda(limite);
  const anterior = !limite
    || (limite.tipo === 'data' && dataLocal.dataLocalISO(autorizadoEm) < limite.data)
    || (limite.tipo === 'minuto' && minutoDe(autorizadoEm) < minutoDe(limite.instante));
  if (anterior) {
    throw new AppError('A data da autorizacao e anterior a venda', 400, 'DATA_AUTORIZACAO_INVALIDA', {
      motivo: 'anterior_a_venda',
      limite_inferior: limite?.tipo === 'data' ? 'data_da_venda' : 'minuto_da_venda',
    });
  }
  return limite;
}

// Autorizacao externa declarada pelo operador: o sistema registra o que foi
// informado; a mensagem em si fica no canal de origem.
async function registrarAutorizacaoExterna(estornoId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO);
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
    if (!autorizador || !roleHasPermission(autorizador.papel, PERMISSIONS.VENDAS_ESTORNO_APROVAR)) {
      throw new AppError('Autorizador sem permissao de aprovar estorno nesta unidade', 422, 'AUTORIZADOR_SEM_PERMISSAO', { autorizador_id: dados.autorizadorId });
    }
    const venda = await obterVenda(tx, estorno.venda_id, scope);
    if (venda.reversao_controlada_id) throw new AppError('Venda ja estornada', 409, 'VENDA_JA_REVERTIDA');
    // A autorizacao pode ser anterior a abertura do pedido (o gestor costuma
    // autorizar no grupo antes do registro), mas nunca anterior a venda nem
    // posterior ao momento do registro.
    const instanteRegistro = new Date();
    const limiteVenda = conferirJanelaDaAutorizacao(dados.autorizadoEm, limiteInferiorDaVenda(venda.data_venda), instanteRegistro);

    const agora = instanteRegistro.toISOString();
    const r = await tx.run(
      `UPDATE venda_estorno
       SET status = ?, aprovado_por = ?, aprovado_por_nome = ?, aprovado_por_papel = ?, aprovado_em = ?,
           autorizacao_canal = ?, autorizacao_referencia = ?,
           autorizacao_registrada_por = ?, autorizacao_registrada_por_nome = ?, autorizacao_registrada_por_papel = ?,
           autorizacao_registrada_em = ?
       WHERE id = ? AND status = ?`,
      [STATUS.APROVADA, String(autorizador.id), autorizador.nome || autorizador.login, autorizador.papel, dados.autorizadoEm.toISOString(),
        dados.canal, dados.referencia, String(actor.id), actor.name || null, actor.role, agora, id, STATUS.SOLICITADA]
    );
    if (r.changes !== 1) throw new AppError('Solicitacao mudou de estado', 409, 'ESTORNO_STATUS_ALTERADO');
    const depois = await tx.get('SELECT * FROM venda_estorno WHERE id = ?', [id]);
    await AuditService.logAction({
      actor,
      action: 'registrar_autorizacao_externa_estorno_venda',
      module: 'vendas_produtos',
      recordType: 'venda_estorno',
      recordId: id,
      before: estorno,
      after: depois,
      metadata: {
        venda_id: estorno.venda_id,
        canal: dados.canal,
        referencia: dados.referencia,
        declarada_pelo_operador: true,
        solicitante: { id: estorno.solicitado_por, em: estorno.solicitado_em },
        autorizador: {
          id: String(autorizador.id),
          papel: autorizador.papel,
          em: dados.autorizadoEm.toISOString(),
          em_informado: dados.autorizadoEmInformado,
          comparacao: 'minuto',
          limite_inferior: limiteVenda.tipo === 'data' ? 'data_da_venda' : 'minuto_da_venda',
        },
        registrado_por: { id: String(actor.id), papel: actor.role, em: agora },
      },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);
    return depois;
  });
}

async function executar(estornoId, payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.VENDAS_ESTORNO_EXECUTAR);
  const id = exigirId(estornoId, 'ESTORNO_ID_INVALIDO');

  return runTransaction(async (tx) => {
    const estorno = await obterEstorno(tx, id, scope);
    recusarPorStatus(estorno, 'executar');
    const contasDistintas = await exigeContasDistintas(tx, scope);
    if (contasDistintas && (mesmaConta(estorno.solicitado_por, actor.id) || mesmaConta(estorno.aprovado_por, actor.id))) {
      throw new AppError('Esta unidade exige solicitante, autorizador e executor distintos', 403, 'CONTAS_DISTINTAS_EXIGIDAS');
    }
    const venda = await obterVenda(tx, estorno.venda_id, scope);
    if (venda.reversao_controlada_id) throw new AppError('Venda ja estornada', 409, 'VENDA_JA_REVERTIDA');
    const item = validarItens(payload.itens, venda);

    // Periodos na unidade: mes da venda (data operacional), mes do lancamento
    // de receita original quando diferente (vendas antigas gravadas em UTC) e
    // mes da contrapartida (data operacional do estorno).
    const dataEstorno = dataLocal.dataLocalISO();
    const dataVenda = dataOperacionalDaVenda(venda.data_venda);
    const lancamento = await tx.get(
      `SELECT * FROM conta_financeira
       WHERE origem = 'venda_produto' AND origem_id = ? AND tenant_id = ? AND unit_id = ?
         AND tipo = 'receita' AND deleted_at IS NULL
       ORDER BY id LIMIT 1`,
      [venda.id, scope.tenant_id, scope.unit_id]
    );
    // Sem a receita original ativo na Rede/Unidade da venda nao ha o que
    // contrapor: a execucao para antes de consumir a aprovacao e nada e gravado.
    // A venda precisa ser conciliada no Financeiro antes de nova tentativa.
    if (!lancamento) {
      throw new AppError(
        'A venda nao tem lancamento de receita original ativo nesta unidade. Concilie a venda no Financeiro antes de executar o estorno; a aprovacao continua valida.',
        409,
        'VENDA_SEM_RECEITA_ORIGINAL',
        { venda_id: venda.id, estorno_id: id, acao_necessaria: 'conciliacao' }
      );
    }
    const datas = [[dataVenda, 'estorno de venda (mes da venda)']];
    if (lancamento.data_lancamento && mesDe(lancamento.data_lancamento) !== mesDe(dataVenda)) {
      datas.push([lancamento.data_lancamento, 'estorno de venda (mes do lancamento original)']);
    }
    datas.push([dataEstorno, 'estorno de venda (mes do estorno)']);
    for (const [data, operacao] of datas) {
      await FechamentoMensalService.assertPeriodoEditavelPorData(data, operacao, tx, scope);
    }

    const produtoAntes = venda.produto_id
      ? await tx.get('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [venda.produto_id, scope.tenant_id, scope.unit_id])
      : null;
    if (item.quantidade_reposta > 0 && !produtoAntes) {
      throw new AppError('Produto da venda nao encontrado para reposicao', 409, 'PRODUTO_NAO_ENCONTRADO');
    }

    // Consome a aprovacao: so uma execucao passa daqui.
    const agora = new Date().toISOString();
    const consumo = await tx.run(
      `UPDATE venda_estorno
       SET status = ?, executado_por = ?, executado_por_nome = ?, executado_por_papel = ?, executado_em = ?,
           data_operacao = ?, quantidade_reposta = ?, contas_distintas_exigidas = ?
       WHERE id = ? AND status = ?`,
      [STATUS.EXECUTADA, String(actor.id), actor.name || null, actor.role, agora, dataEstorno, item.quantidade_reposta,
        contasDistintas ? 1 : 0, id, STATUS.APROVADA]
    );
    if (consumo.changes !== 1) throw new AppError('Aprovacao ja consumida', 409, 'ESTORNO_JA_EXECUTADO');

    const responsavel = { ...actor, tenant_id: scope.tenant_id, unit_id: scope.unit_id };
    const reversao = await ReversaoControladaService.inserirRegistroReversao(tx, {
      modulo: 'vendas_produtos',
      tipo: 'venda_produto',
      registroId: venda.id,
      motivo: estorno.motivo,
      actor: responsavel,
      metadata: {
        venda_estorno_id: id,
        lancamento_id: lancamento.id,
        produto_id: venda.produto_id,
        quantidade_vendida: item.quantidade_vendida,
        quantidade_reposta: item.quantidade_reposta,
        solicitado_por: estorno.solicitado_por,
        autorizado_por: estorno.aprovado_por,
        autorizacao_canal: estorno.autorizacao_canal,
        autorizacao_registrada_por: estorno.autorizacao_registrada_por,
      },
    });

    // Contrapartida do valor integral da venda, na data operacional do estorno.
    const origem = { ...lancamento, valor: Number(venda.valor_total || 0) };
    const lancamentoInverso = await ReversaoControladaService.criarLancamentoInverso(tx, {
      reversao,
      lancamento: origem,
      descricao: `Estorno da venda ${venda.id}`,
      dataLancamento: dataEstorno,
    });

    if (item.quantidade_reposta > 0) {
      await tx.run(
        'UPDATE produto SET estoque = estoque + ? WHERE id = ? AND tenant_id = ? AND unit_id = ?',
        [item.quantidade_reposta, venda.produto_id, scope.tenant_id, scope.unit_id]
      );
    }

    const marca = await tx.run(
      'UPDATE venda_produto SET reversao_controlada_id = ? WHERE id = ? AND reversao_controlada_id IS NULL',
      [reversao.id, venda.id]
    );
    if (marca.changes !== 1) throw new AppError('Venda ja estornada', 409, 'VENDA_JA_REVERTIDA');

    await tx.run(
      'UPDATE venda_estorno SET reversao_controlada_id = ?, lancamento_inverso_id = ? WHERE id = ?',
      [reversao.id, lancamentoInverso?.id || null, id]
    );

    const produtoDepois = venda.produto_id
      ? await tx.get('SELECT * FROM produto WHERE id = ? AND tenant_id = ? AND unit_id = ?', [venda.produto_id, scope.tenant_id, scope.unit_id])
      : null;
    const estornoDepois = await tx.get('SELECT * FROM venda_estorno WHERE id = ?', [id]);
    const vendaDepois = await tx.get('SELECT * FROM venda_produto WHERE id = ?', [venda.id]);
    const quantidades = {
      quantidade_vendida: item.quantidade_vendida,
      quantidade_reposta: item.quantidade_reposta,
      quantidade_fora_do_estoque: item.quantidade_vendida - item.quantidade_reposta,
    };

    await AuditService.logAction({
      actor: responsavel,
      action: 'executar_estorno_venda',
      module: 'vendas_produtos',
      recordType: 'venda_estorno',
      recordId: id,
      before: { estorno, venda, produto: produtoAntes, lancamento },
      after: { estorno: estornoDepois, venda: vendaDepois, produto: produtoDepois, lancamento_inverso: lancamentoInverso },
      metadata: {
        venda_id: venda.id,
        motivo: estorno.motivo,
        valor_estornado: Number(venda.valor_total || 0),
        data_estorno: dataEstorno,
        data_venda: dataVenda,
        estoque_antes: produtoAntes ? produtoAntes.estoque : null,
        estoque_depois: produtoDepois ? produtoDepois.estoque : null,
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
        ...quantidades,
      },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);

    return {
      estorno: estornoDepois,
      venda: vendaDepois,
      produto: produtoDepois,
      lancamento_inverso: lancamentoInverso,
      reversao,
      ...quantidades,
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
  if (filtros.venda_id) {
    where += ' AND e.venda_id = ?';
    params.push(Number(filtros.venda_id));
  }
  return runQuery(
    `SELECT e.*, v.produto_id, v.produto_nome, v.quantidade, v.preco_unitario, v.valor_total, v.data_venda
     FROM venda_estorno e
     JOIN venda_produto v ON v.id = e.venda_id AND v.tenant_id = e.tenant_id AND v.unit_id = e.unit_id
     ${where}
     ORDER BY e.id DESC
     LIMIT 200`,
    params
  );
}

// Contas da unidade que podem autorizar (para o registro de autorizacao
// externa). A conta do proprio operador nao aparece.
async function listarAutorizadores(scope, actor) {
  scope = exigirEscopo(scope);
  const papeis = Object.entries(ROLE_PERMISSIONS)
    .filter(([, perms]) => perms.includes(PERMISSIONS.VENDAS_ESTORNO_APROVAR))
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
  const row = await runQuery('SELECT estorno_venda_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
  return { contas_distintas: Number(row[0]?.estorno_venda_contas_distintas || 0) === 1 };
}

async function definirPolitica(contasDistintas, actor, scope) {
  scope = exigirEscopo(scope);
  if (typeof contasDistintas !== 'boolean') {
    throw new AppError('Informe contas_distintas como verdadeiro ou falso', 400, 'POLITICA_ESTORNO_INVALIDA');
  }
  return runTransaction(async (tx) => {
    const before = await tx.get('SELECT estorno_venda_contas_distintas FROM unit WHERE id = ? AND tenant_id = ?', [scope.unit_id, scope.tenant_id]);
    await tx.run('UPDATE unit SET estorno_venda_contas_distintas = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?',
      [contasDistintas ? 1 : 0, scope.unit_id, scope.tenant_id]);
    await AuditService.logAction({
      actor,
      action: 'configurar_politica_estorno_venda',
      module: 'unidades',
      recordType: 'unit',
      recordId: scope.unit_id,
      before,
      after: { estorno_venda_contas_distintas: contasDistintas ? 1 : 0 },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);
    return { contas_distintas: contasDistintas };
  });
}

module.exports = {
  STATUS,
  solicitar,
  aprovar,
  registrarAutorizacaoExterna,
  executar,
  listar,
  listarAutorizadores,
  obterPolitica,
  definirPolitica,
  dataOperacionalDaVenda,
  conferirJanelaDaAutorizacao,
};
