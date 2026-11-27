// Pendencias por estorno e contato com o aluno (L04, sublote B; decisoes de
// 20/11 e 26/11/2026).
//
// 1. Cobertura proporcional. Quando um pagamento de uma mensalidade que cobre
//    varios meses (pacote) e estornado, a cobertura passa a ser a dos meses
//    inteiros que o valor que continua pago quita, contados do inicio da
//    cobertura (arredondando para baixo). Ex.: trimestral de R$ 300 com
//    R$ 200 pagos cobre 2 meses. Enquanto o dia de hoje estiver nesse periodo,
//    o acesso segue liberado com restricao; depois, bloqueia. Se o valor pago
//    nao cobre nem o primeiro mes, bloqueia na hora. A mensalidade de um mes so
//    nao tem cobertura proporcional: estorno parcial bloqueia na hora.
// 2. Pendencias. Mensalidade com estorno de pagamento executado e saldo em
//    aberto vira pendencia da unidade, mostrada no Dashboard, no perfil do
//    aluno e no teste de acesso, ate um novo pagamento quita-la.
// 3. Contato. "Contatar aluno" abre WhatsApp ou e-mail e registra a tentativa
//    (canal, observacao, operador e data), sem mudar a pendencia.
const { runQuery, runGet, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const { MENSALIDADE_STATUS } = require('../constants/domainStates');
const { PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const { dataLocalISO } = require('../utils/dataLocal');
const { paraCentavos, deCentavos } = require('../utils/dinheiro');

const DIAS_POR_MES = 30;
const CANAIS_CONTATO = Object.freeze(['whatsapp', 'email', 'telefone', 'presencial']);
const STATUS_SEM_PENDENCIA = [
  MENSALIDADE_STATUS.PAGO,
  MENSALIDADE_STATUS.CANCELADO,
  MENSALIDADE_STATUS.EM_REVERSAO_CONTROLADA,
];

function dataISO(valor) {
  if (!valor || valor === '0000-00-00') return null;
  const s = String(valor).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function diasEntre(inicio, fim) {
  const a = Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10));
  const b = Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 1, +fim.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

// Soma meses ao inicio da cobertura e volta um dia: fim do k-esimo mes.
// Dia inexistente no mes de destino (31/01 + 1 mes) cobre ate o ultimo dia
// desse mes (28 ou 29/02).
function fimDoMes(inicio, meses) {
  const ano = +inicio.slice(0, 4);
  const mes = +inicio.slice(5, 7) - 1 + meses;
  const dia = +inicio.slice(8, 10);
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const alvo = new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia)));
  if (dia <= ultimoDia) alvo.setUTCDate(alvo.getUTCDate() - 1);
  return alvo.toISOString().slice(0, 10);
}

function centavos(valor) {
  return paraCentavos(valor || 0) ?? Math.round(Number(valor || 0) * 100);
}

// Meses cobertos pela mensalidade (pelas datas de cobertura); 0 quando nao ha datas.
function mesesDaCobertura(mensalidade) {
  const inicio = dataISO(mensalidade.data_inicio);
  const fim = dataISO(mensalidade.data_fim);
  if (!inicio || !fim || fim < inicio) return 0;
  return Math.max(1, Math.round((diasEntre(inicio, fim) + 1) / DIAS_POR_MES));
}

// Calculo puro, exportado para os testes.
function calcularCoberturaProporcional(mensalidade, pagoCentavos) {
  const meses = mesesDaCobertura(mensalidade);
  const cobradoCentavos = centavos(mensalidade.valor_cobrado);
  const inicio = dataISO(mensalidade.data_inicio);
  const fim = dataISO(mensalidade.data_fim);
  const base = { pacote: meses >= 2, meses, meses_cobertos: 0, cobertura_ate: null };
  if (!base.pacote || cobradoCentavos <= 0) return base;
  const mesesCobertos = Math.min(meses, Math.floor((Math.max(pagoCentavos, 0) * meses) / cobradoCentavos));
  if (mesesCobertos <= 0) return base;
  const ate = mesesCobertos >= meses ? fim : fimDoMes(inicio, mesesCobertos);
  return { ...base, meses_cobertos: mesesCobertos, cobertura_ate: ate > fim ? fim : ate };
}

async function pagoPorMensalidade(ids) {
  if (!ids.length) return new Map();
  const rows = await runQuery(
    `SELECT p.mensalidade_id, p.valor_pago FROM pagamento p
     JOIN mensalidade m ON m.id = p.mensalidade_id
     WHERE p.mensalidade_id IN (${ids.map(() => '?').join(',')}) AND p.estornado_em IS NULL
       AND (p.tenant_id = m.tenant_id OR p.tenant_id IS NULL) AND (p.unit_id = m.unit_id OR p.unit_id IS NULL)`,
    ids
  );
  const mapa = new Map();
  for (const r of rows) mapa.set(r.mensalidade_id, (mapa.get(r.mensalidade_id) || 0) + centavos(r.valor_pago));
  return mapa;
}

async function mensalidadesComEstornoExecutado(ids) {
  if (!ids.length) return new Map();
  const rows = await runQuery(
    `SELECT mensalidade_id, MAX(executado_em) AS ultimo_estorno_em, COUNT(*) AS estornos
     FROM pagamento_estorno
     WHERE status = 'executada' AND mensalidade_id IN (${ids.map(() => '?').join(',')})
     GROUP BY mensalidade_id`,
    ids
  );
  return new Map(rows.map((r) => [r.mensalidade_id, r]));
}

// Usado pelo AccessService antes de decidir o acesso. Mensalidades de pacote
// com estorno executado e saldo em aberto passam a valer como pagas ate o fim
// da cobertura proporcional; depois dele, ficam marcadas como encerradas.
async function aplicarCoberturaProporcional(mensalidades, hoje = dataLocalISO(new Date())) {
  const candidatas = mensalidades.filter((m) => [
    MENSALIDADE_STATUS.PARCIAL, MENSALIDADE_STATUS.EM_ABERTO, MENSALIDADE_STATUS.VENCIDO,
  ].includes(m.status) && mesesDaCobertura(m) >= 2);
  if (!candidatas.length) return mensalidades;
  const ids = candidatas.map((m) => m.id);
  const [estornos, pagos] = await Promise.all([mensalidadesComEstornoExecutado(ids), pagoPorMensalidade(ids)]);
  return mensalidades.map((m) => {
    if (!ids.includes(m.id) || !estornos.has(m.id)) return m;
    const pagoCentavos = pagos.get(m.id) || 0;
    const cobertura = calcularCoberturaProporcional(m, pagoCentavos);
    const info = {
      mensalidade_id: m.id,
      meses: cobertura.meses,
      meses_cobertos: cobertura.meses_cobertos,
      cobertura_ate: cobertura.cobertura_ate,
      saldo_em_aberto: deCentavos(Math.max(centavos(m.valor_cobrado) - pagoCentavos, 0)),
    };
    if (cobertura.cobertura_ate && cobertura.cobertura_ate >= hoje) {
      return { ...m, status: MENSALIDADE_STATUS.PAGO, data_fim: cobertura.cobertura_ate, cobertura_proporcional: info };
    }
    return { ...m, cobertura_proporcional_encerrada: info };
  });
}

function exigirEscopo(scope) {
  if (!scope?.tenant_id || !scope?.unit_id) throw new AppError('Escopo de tenant/unidade nao resolvido', 401, 'SCOPE_REQUIRED');
  return scope;
}

function exigirPermissao(actor, permissao) {
  if (!actor?.id || !actor?.role || !roleHasPermission(actor.role, permissao)) {
    throw new AppError('Permissao negada', 403, 'PERMISSAO_NEGADA');
  }
}

async function ultimosContatos(scope, alunoIds) {
  if (!alunoIds.length) return new Map();
  const rows = await runQuery(
    `SELECT c.* FROM aluno_contato c
     WHERE c.tenant_id = ? AND c.unit_id = ? AND c.aluno_id IN (${alunoIds.map(() => '?').join(',')})
       AND c.id = (SELECT MAX(c2.id) FROM aluno_contato c2 WHERE c2.aluno_id = c.aluno_id AND c2.tenant_id = c.tenant_id AND c2.unit_id = c.unit_id)`,
    [scope.tenant_id, scope.unit_id, ...alunoIds]
  );
  const contagem = await runQuery(
    `SELECT aluno_id, COUNT(*) AS total FROM aluno_contato
     WHERE tenant_id = ? AND unit_id = ? AND aluno_id IN (${alunoIds.map(() => '?').join(',')}) GROUP BY aluno_id`,
    [scope.tenant_id, scope.unit_id, ...alunoIds]
  );
  const totais = new Map(contagem.map((r) => [r.aluno_id, r.total]));
  return new Map(rows.map((r) => [r.aluno_id, { ...publicarContato(r), total: totais.get(r.aluno_id) || 0 }]));
}

function publicarContato(r) {
  return {
    id: r.id,
    aluno_id: r.aluno_id,
    mensalidade_id: r.mensalidade_id,
    canal: r.canal,
    observacao: r.observacao,
    registrado_por: r.registrado_por,
    registrado_por_nome: r.registrado_por_nome,
    registrado_por_papel: r.registrado_por_papel,
    registrado_em: r.registrado_em,
  };
}

// Pendencias da unidade (ou de um aluno). Ordem: bloqueados primeiro, depois
// pelo fim da cobertura proporcional mais proximo.
async function listarPendencias(scope, filtros = {}, hoje = dataLocalISO(new Date())) {
  scope = exigirEscopo(scope);
  const params = [scope.tenant_id, scope.unit_id, ...STATUS_SEM_PENDENCIA];
  let filtroAluno = '';
  if (filtros.aluno_id) {
    filtroAluno = 'AND m.aluno_id = ?';
    params.push(Number(filtros.aluno_id));
  }
  const rows = await runQuery(
    `SELECT m.*, a.nome AS aluno_nome, a.matricula, a.telefone, a.email, a.status AS aluno_status,
            pl.nome AS plano_nome,
            (SELECT MAX(e.executado_em) FROM pagamento_estorno e WHERE e.mensalidade_id = m.id AND e.status = 'executada') AS ultimo_estorno_em
     FROM mensalidade m
     JOIN aluno a ON a.id = m.aluno_id AND a.tenant_id = m.tenant_id AND a.unit_id = m.unit_id
     LEFT JOIN plano pl ON pl.id = m.plano_id
     WHERE m.tenant_id = ? AND m.unit_id = ? AND m.deleted_at IS NULL
       AND COALESCE(m.status, '') NOT IN (?, ?, ?)
       AND EXISTS (SELECT 1 FROM pagamento_estorno e WHERE e.mensalidade_id = m.id AND e.status = 'executada'
                   AND e.tenant_id = m.tenant_id AND e.unit_id = m.unit_id)
       ${filtroAluno}
     ORDER BY m.id DESC
     LIMIT 200`,
    params
  );
  if (!rows.length) return [];
  const pagos = await pagoPorMensalidade(rows.map((r) => r.id));
  const contatos = await ultimosContatos(scope, [...new Set(rows.map((r) => r.aluno_id))]);
  const lista = rows.map((m) => {
    const pagoCentavos = pagos.get(m.id) || 0;
    const saldoCentavos = Math.max(centavos(m.valor_cobrado) - pagoCentavos, 0);
    const cobertura = calcularCoberturaProporcional(m, pagoCentavos);
    const liberadoAte = cobertura.cobertura_ate && cobertura.cobertura_ate >= hoje ? cobertura.cobertura_ate : null;
    return {
      mensalidade_id: m.id,
      aluno_id: m.aluno_id,
      aluno_nome: m.aluno_nome,
      matricula: m.matricula,
      telefone: m.telefone || null,
      email: m.email || null,
      plano_nome: m.plano_nome || null,
      tipo: cobertura.pacote ? 'pacote' : 'mensal',
      status_mensalidade: m.status,
      vencimento: m.vencimento,
      data_inicio: m.data_inicio,
      data_fim: m.data_fim,
      valor_cobrado: deCentavos(centavos(m.valor_cobrado)),
      total_pago: deCentavos(pagoCentavos),
      saldo_em_aberto: deCentavos(saldoCentavos),
      meses: cobertura.meses,
      meses_cobertos: cobertura.meses_cobertos,
      cobertura_ate: cobertura.cobertura_ate,
      acesso: liberadoAte ? 'liberado_ate' : 'bloqueado',
      liberado_ate: liberadoAte,
      ultimo_estorno_em: m.ultimo_estorno_em,
      ultimo_contato: contatos.get(m.aluno_id) || null,
    };
  }).filter((p) => p.saldo_em_aberto > 0);
  return lista.sort((a, b) => {
    if (a.acesso !== b.acesso) return a.acesso === 'bloqueado' ? -1 : 1;
    return String(a.liberado_ate || '').localeCompare(String(b.liberado_ate || '')) || b.mensalidade_id - a.mensalidade_id;
  });
}

async function resumo(scope, hoje) {
  const lista = await listarPendencias(scope, {}, hoje);
  return {
    total: lista.length,
    bloqueados: lista.filter((p) => p.acesso === 'bloqueado').length,
    sem_contato: lista.filter((p) => !p.ultimo_contato).length,
  };
}

function normalizarCanal(canal) {
  const valor = String(canal || '').trim().toLowerCase();
  if (!CANAIS_CONTATO.includes(valor)) {
    throw new AppError(`Canal invalido. Use: ${CANAIS_CONTATO.join(', ')}`, 400, 'CONTATO_CANAL_INVALIDO');
  }
  return valor;
}

async function registrarContato(payload = {}, actor, scope) {
  scope = exigirEscopo(scope);
  exigirPermissao(actor, PERMISSIONS.ALUNOS_CONTATO_REGISTRAR);
  const alunoId = Number(payload.aluno_id);
  if (!Number.isInteger(alunoId) || alunoId <= 0) throw new AppError('aluno_id invalido', 400, 'ALUNO_ID_INVALIDO');
  const canal = normalizarCanal(payload.canal);
  const observacao = payload.observacao == null ? null : String(payload.observacao).trim().slice(0, 500) || null;
  const mensalidadeId = payload.mensalidade_id == null || payload.mensalidade_id === '' ? null : Number(payload.mensalidade_id);
  if (mensalidadeId !== null && (!Number.isInteger(mensalidadeId) || mensalidadeId <= 0)) {
    throw new AppError('mensalidade_id invalido', 400, 'MENSALIDADE_ID_INVALIDO');
  }

  return runTransaction(async (tx) => {
    const aluno = await tx.get('SELECT id, nome, telefone, email FROM aluno WHERE id = ? AND tenant_id = ? AND unit_id = ?',
      [alunoId, scope.tenant_id, scope.unit_id]);
    if (!aluno) throw new AppError('Aluno nao encontrado', 404, 'ALUNO_NAO_ENCONTRADO');
    if (mensalidadeId !== null) {
      const m = await tx.get('SELECT id FROM mensalidade WHERE id = ? AND aluno_id = ? AND tenant_id = ? AND unit_id = ?',
        [mensalidadeId, alunoId, scope.tenant_id, scope.unit_id]);
      if (!m) throw new AppError('Mensalidade nao encontrada', 404, 'MENSALIDADE_NAO_ENCONTRADA');
    }
    if (canal === 'whatsapp' && !aluno.telefone) throw new AppError('Aluno sem telefone cadastrado', 422, 'CONTATO_SEM_TELEFONE');
    if (canal === 'email' && !aluno.email) throw new AppError('Aluno sem e-mail cadastrado', 422, 'CONTATO_SEM_EMAIL');
    const agora = new Date().toISOString();
    const r = await tx.run(
      `INSERT INTO aluno_contato (tenant_id, unit_id, aluno_id, mensalidade_id, canal, observacao,
         registrado_por, registrado_por_nome, registrado_por_papel, registrado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scope.tenant_id, scope.unit_id, alunoId, mensalidadeId, canal, observacao,
        String(actor.id), actor.name || null, actor.role, agora]
    );
    const contato = publicarContato(await tx.get('SELECT * FROM aluno_contato WHERE id = ?', [r.lastID]));
    await AuditService.logAction({
      actor,
      action: 'registrar_contato_aluno',
      module: 'alunos',
      recordType: 'aluno_contato',
      recordId: contato.id,
      before: null,
      after: contato,
      metadata: { aluno_id: alunoId, mensalidade_id: mensalidadeId, canal },
      tenant_id: scope.tenant_id,
      unit_id: scope.unit_id,
    }, tx);
    return contato;
  });
}

async function listarContatos(scope, alunoId) {
  scope = exigirEscopo(scope);
  const id = Number(alunoId);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('aluno_id invalido', 400, 'ALUNO_ID_INVALIDO');
  const aluno = await runGet('SELECT id FROM aluno WHERE id = ? AND tenant_id = ? AND unit_id = ?', [id, scope.tenant_id, scope.unit_id]);
  if (!aluno) throw new AppError('Aluno nao encontrado', 404, 'ALUNO_NAO_ENCONTRADO');
  const rows = await runQuery(
    'SELECT * FROM aluno_contato WHERE tenant_id = ? AND unit_id = ? AND aluno_id = ? ORDER BY id DESC LIMIT 100',
    [scope.tenant_id, scope.unit_id, id]
  );
  return rows.map(publicarContato);
}

module.exports = {
  CANAIS_CONTATO,
  calcularCoberturaProporcional,
  aplicarCoberturaProporcional,
  listarPendencias,
  resumo,
  registrarContato,
  listarContatos,
};
