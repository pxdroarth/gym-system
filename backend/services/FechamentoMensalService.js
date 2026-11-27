const { runQuery, runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const { FECHAMENTO_STATUS } = require('../constants/domainStates');
const { PERMISSIONS, ROLE_PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const { USER_SCOPE_STATUS } = require('../constants/scope');
const { conferenciaDoPeriodo } = require('./ConferenciaMeiosService');

function clientOrDefault(client) {
  return client || { all: runQuery, get: runGet, run: runExecute };
}

function periodoDeData(data) {
  const d = data ? new Date(`${String(data).slice(0, 10)}T12:00:00`) : new Date();
  return {
    ano: d.getFullYear(),
    mes: d.getMonth() + 1,
  };
}

function validarPeriodo(ano, mes) {
  const anoNum = Number(ano);
  const mesNum = Number(mes);
  if (!anoNum || !mesNum || mesNum < 1 || mesNum > 12) {
    throw new AppError('Periodo invalido', 400, 'PERIODO_INVALIDO');
  }
  return { ano: anoNum, mes: mesNum };
}

function intervaloPeriodo(ano, mes) {
  const ini = `${ano}-${String(mes).padStart(2, '0')}-01`;
  const fim = new Date(ano, mes, 0).toISOString().slice(0, 10);
  return { inicio: ini, fim };
}

async function obterFechamento(ano, mes, client = null, scope = null) {
  const db = clientOrDefault(client);
  if (scope?.tenant_id && scope?.unit_id) {
    return db.get(
      'SELECT * FROM fechamento_mensal WHERE ano = ? AND mes = ? AND tenant_id = ? AND unit_id = ?',
      [ano, mes, scope.tenant_id, scope.unit_id]
    );
  }
  return db.get('SELECT * FROM fechamento_mensal WHERE ano = ? AND mes = ?', [ano, mes]);
}

async function assertPeriodoEditavelPorData(data, operacao, client = null, scope = null) {
  // S1-P0 (FV-02c): o fechamento e por unidade. Sem escopo, a consulta
  // pegaria o fechamento de qualquer unidade do mes; por isso falha fechado.
  if (!scope?.tenant_id || !scope?.unit_id) {
    throw new AppError(
      `Escopo de rede/unidade obrigatorio para validar fechamento (${operacao})`,
      500,
      'FECHAMENTO_ESCOPO_OBRIGATORIO'
    );
  }
  const { ano, mes } = periodoDeData(data);
  const fechamento = await obterFechamento(ano, mes, client, scope);

  // Fechamento mensal funciona como trava transversal contra escrita
  // retroativa; qualquer modulo com efeito operacional/financeiro datado
  // precisa respeitar esse guard antes de persistir mudancas.
  if (
    fechamento &&
    [FECHAMENTO_STATUS.FECHADO, FECHAMENTO_STATUS.FECHADO_COM_INCONSISTENCIAS].includes(fechamento.status)
  ) {
    throw new AppError(
      `Periodo ${String(mes).padStart(2, '0')}/${ano} esta fechado para ${operacao}`,
      423,
      'PERIODO_FECHADO',
      { ano, mes, status: fechamento.status, operacao }
    );
  }
}

async function analisarPeriodo(ano, mes, client = null, scope = null) {
  const { ano: anoNum, mes: mesNum } = validarPeriodo(ano, mes);
  const db = clientOrDefault(client);
  const { inicio, fim } = intervaloPeriodo(anoNum, mesNum);
  const inconsistencias = [];

  const mensalidadesSemLancamento = await db.all(
    `SELECT m.id, m.status, m.aluno_id
     FROM mensalidade m
     LEFT JOIN conta_financeira cf ON cf.origem = 'mensalidade' AND cf.origem_id = m.id
     WHERE m.status IN ('pago', 'parcial')
       AND m.deleted_at IS NULL
       AND DATE(COALESCE(m.updated_at, m.vencimento)) BETWEEN DATE(?) AND DATE(?)
       AND cf.id IS NULL
       -- GS-07 P1: pagamentos novos tem lancamento proprio por pagamento.
       AND NOT EXISTS (
         SELECT 1 FROM pagamento p
         JOIN conta_financeira cfp ON cfp.origem = 'pagamento_mensalidade' AND cfp.origem_id = p.id AND cfp.deleted_at IS NULL
         WHERE p.mensalidade_id = m.id
       )
       ${scope?.tenant_id && scope?.unit_id ? 'AND m.tenant_id = ? AND m.unit_id = ?' : ''}`,
    scope?.tenant_id && scope?.unit_id ? [inicio, fim, scope.tenant_id, scope.unit_id] : [inicio, fim]
  );
  for (const item of mensalidadesSemLancamento) {
    inconsistencias.push({
      tipo: 'mensalidade_sem_lancamento_financeiro',
      modulo: 'mensalidades',
      registro_id: item.id,
      detalhe: item,
    });
  }

  const vendasSemEntrada = await db.all(
    `SELECT v.id, v.produto_id, v.valor_total
     FROM venda_produto v
     LEFT JOIN conta_financeira cf ON cf.origem = 'venda_produto' AND cf.origem_id = v.id
     WHERE DATE(v.data_venda) BETWEEN DATE(?) AND DATE(?)
       AND v.deleted_at IS NULL
       AND cf.id IS NULL
       ${scope?.tenant_id && scope?.unit_id ? 'AND v.tenant_id = ? AND v.unit_id = ?' : ''}`,
    scope?.tenant_id && scope?.unit_id ? [inicio, fim, scope.tenant_id, scope.unit_id] : [inicio, fim]
  );
  for (const item of vendasSemEntrada) {
    inconsistencias.push({
      tipo: 'venda_sem_entrada_financeira',
      modulo: 'vendas_produtos',
      registro_id: item.id,
      detalhe: item,
    });
  }

  const lancamentosOrfaos = await db.all(
    `SELECT cf.id, cf.origem, cf.origem_id
     FROM conta_financeira cf
     LEFT JOIN mensalidade m ON cf.origem = 'mensalidade' AND cf.origem_id = m.id
     LEFT JOIN venda_produto v ON cf.origem = 'venda_produto' AND cf.origem_id = v.id
     LEFT JOIN pagamento pg ON cf.origem = 'pagamento_mensalidade' AND cf.origem_id = pg.id
     WHERE DATE(cf.data_lancamento) BETWEEN DATE(?) AND DATE(?)
       AND cf.deleted_at IS NULL
       AND cf.origem IN ('mensalidade', 'venda_produto', 'pagamento_mensalidade')
       ${scope?.tenant_id && scope?.unit_id ? 'AND cf.tenant_id = ? AND cf.unit_id = ?' : ''}
       AND (
         (cf.origem = 'mensalidade' AND m.id IS NULL)
         OR (cf.origem = 'venda_produto' AND v.id IS NULL)
         OR (cf.origem = 'pagamento_mensalidade' AND pg.id IS NULL)
       )`,
    scope?.tenant_id && scope?.unit_id ? [inicio, fim, scope.tenant_id, scope.unit_id] : [inicio, fim]
  );
  for (const item of lancamentosOrfaos) {
    inconsistencias.push({
      tipo: 'lancamento_financeiro_orfao',
      modulo: 'financeiro',
      registro_id: item.id,
      detalhe: item,
    });
  }

  const vendasProdutoOrfao = await db.all(
    `SELECT v.id, v.produto_id
     FROM venda_produto v
     LEFT JOIN produto p ON p.id = v.produto_id
     WHERE DATE(v.data_venda) BETWEEN DATE(?) AND DATE(?)
       AND v.deleted_at IS NULL
       AND v.produto_id IS NOT NULL
       AND p.id IS NULL
       ${scope?.tenant_id && scope?.unit_id ? 'AND v.tenant_id = ? AND v.unit_id = ?' : ''}`,
    scope?.tenant_id && scope?.unit_id ? [inicio, fim, scope.tenant_id, scope.unit_id] : [inicio, fim]
  );
  for (const item of vendasProdutoOrfao) {
    inconsistencias.push({
      tipo: 'venda_com_produto_orfao',
      modulo: 'vendas_produtos',
      registro_id: item.id,
      detalhe: item,
    });
  }

  // L04 sublote D: chave estavel de cada divergencia (para a ressalva) e a
  // conferencia por meio do periodo.
  for (const item of inconsistencias) item.chave = `${item.tipo}:${item.registro_id}`;
  const conferencia = scope?.tenant_id && scope?.unit_id
    ? await conferenciaDoPeriodo(db, inicio, fim, scope)
    : null;

  return {
    ano: anoNum,
    mes: mesNum,
    inicio,
    fim,
    inconsistencias,
    conferencia,
  };
}

// Situacao do mes para a tela: fechamento gravado (ou aberto) e analise.
async function situacaoDoPeriodo(ano, mes, scope) {
  const periodo = validarPeriodo(ano, mes);
  const [fechamento, analise] = await Promise.all([
    obterFechamento(periodo.ano, periodo.mes, null, scope),
    analisarPeriodo(periodo.ano, periodo.mes, null, scope),
  ]);
  return { fechamento: publicarFechamento(fechamento), analise };
}

function publicarFechamento(f) {
  if (!f) return null;
  const json = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return {
    id: f.id,
    ano: f.ano,
    mes: f.mes,
    status: f.status,
    fechado_em: f.fechado_em,
    reaberto_em: f.reaberto_em,
    fechado_por: f.fechado_por || null,
    fechado_por_nome: f.fechado_por_nome || null,
    inconsistencias: json(f.inconsistencias_json) || [],
    ressalva: json(f.ressalva_json),
    conferencia: json(f.conferencia_json),
  };
}

async function listarFechamentos(scope) {
  if (!scope?.tenant_id || !scope?.unit_id) throw new AppError('Escopo de tenant/unidade nao resolvido', 401, 'SCOPE_REQUIRED');
  const rows = await runQuery(
    'SELECT * FROM fechamento_mensal WHERE tenant_id = ? AND unit_id = ? ORDER BY ano DESC, mes DESC LIMIT 36',
    [scope.tenant_id, scope.unit_id]
  );
  return rows.map(publicarFechamento);
}

// Quem pode acompanhar uma ressalva: contas ativas da unidade com acesso ao Financeiro.
async function listarResponsaveis(scope) {
  if (!scope?.tenant_id || !scope?.unit_id) throw new AppError('Escopo de tenant/unidade nao resolvido', 401, 'SCOPE_REQUIRED');
  const papeis = Object.entries(ROLE_PERMISSIONS)
    .filter(([, perms]) => perms.includes(PERMISSIONS.FINANCEIRO_ACESSAR))
    .map(([papel]) => papel)
    .filter((papel) => papel !== 'platform_admin');
  return runQuery(
    `SELECT ui.id, ui.nome, ui.papel
     FROM usuario_interno ui
     JOIN usuario_unit uu ON uu.usuario_id = ui.id AND uu.unit_id = ? AND uu.status = ?
     JOIN usuario_tenant ut ON ut.usuario_id = ui.id AND ut.tenant_id = ? AND ut.status = ?
     WHERE ui.status = 'ativo' AND ui.papel IN (${papeis.map(() => '?').join(',')})
     ORDER BY ui.nome COLLATE NOCASE`,
    [scope.unit_id, USER_SCOPE_STATUS.ATIVO, scope.tenant_id, USER_SCOPE_STATUS.ATIVO, ...papeis]
  );
}

// Ressalva (decisao 6): divergencia temporaria comprovada permite ao dono ou
// admin fechar registrando motivo, evidencia, valor e responsavel.
async function validarRessalva(tx, payload, scope) {
  const r = payload?.ressalva;
  if (!r || typeof r !== 'object') return null;
  const texto = (v) => String(v ?? '').trim();
  const motivo = texto(r.motivo);
  const evidencia = texto(r.evidencia);
  if (motivo.length < 3 || motivo.length > 500) throw new AppError('Informe o motivo da ressalva', 400, 'RESSALVA_MOTIVO_OBRIGATORIO');
  if (evidencia.length < 3 || evidencia.length > 500) throw new AppError('Informe a evidencia da ressalva', 400, 'RESSALVA_EVIDENCIA_OBRIGATORIA');
  const valor = r.valor === undefined || r.valor === null || r.valor === '' ? null : Number(r.valor);
  if (valor !== null && (!Number.isFinite(valor) || valor < 0 || Math.round(valor * 100) !== valor * 100)) {
    throw new AppError('Valor da ressalva invalido', 400, 'RESSALVA_VALOR_INVALIDO');
  }
  const responsavelId = Number(r.responsavel_id);
  if (!Number.isInteger(responsavelId) || responsavelId <= 0) throw new AppError('Informe o responsavel pelo acompanhamento', 400, 'RESSALVA_RESPONSAVEL_OBRIGATORIO');
  const responsaveis = await listarResponsaveis(scope);
  const responsavel = responsaveis.find((u) => Number(u.id) === responsavelId);
  if (!responsavel) throw new AppError('Responsavel sem acesso ao Financeiro desta unidade', 422, 'RESSALVA_RESPONSAVEL_INVALIDO');
  return { motivo, evidencia, valor, responsavel: { id: String(responsavel.id), nome: responsavel.nome, papel: responsavel.papel } };
}

// L04 sublote D (decisao 6 de 16/11/2026): divergencia sem ressalva bloqueia o
// fechamento; com ressalva do dono ou admin o mes fecha com o status
// fechado_com_inconsistencias e a ressalva gravada.
async function fecharPeriodo(ano, mes, actor, scope = null, payload = {}) {
  return runTransaction(async (tx) => {
    const periodo = validarPeriodo(ano, mes);
    const before = await obterFechamento(periodo.ano, periodo.mes, tx, scope);
    const analise = await analisarPeriodo(periodo.ano, periodo.mes, tx, scope);
    let ressalva = null;
    if (analise.inconsistencias.length) {
      ressalva = await validarRessalva(tx, payload, scope);
      if (!ressalva) {
        throw new AppError(
          'O periodo tem divergencias. Corrija-as ou feche com ressalva (motivo, evidencia e responsavel).',
          409,
          'FECHAMENTO_COM_DIVERGENCIA',
          { inconsistencias: analise.inconsistencias }
        );
      }
      ressalva = {
        ...ressalva,
        divergencias: analise.inconsistencias.map((i) => i.chave),
        registrada_por: { id: actor?.id != null ? String(actor.id) : null, nome: actor?.name || null, papel: actor?.role || null },
        registrada_em: new Date().toISOString(),
      };
    }
    const status = ressalva ? FECHAMENTO_STATUS.FECHADO_COM_INCONSISTENCIAS : FECHAMENTO_STATUS.FECHADO;
    const inconsistenciasJson = JSON.stringify(analise.inconsistencias);
    const ressalvaJson = ressalva ? JSON.stringify(ressalva) : null;
    const conferenciaJson = analise.conferencia ? JSON.stringify(analise.conferencia) : null;
    const fechadoPor = actor?.id != null ? String(actor.id) : null;

    if (before) {
      await tx.run(
        `UPDATE fechamento_mensal
         SET status = ?, inconsistencias_json = ?, ressalva_json = ?, conferencia_json = ?, fechado_por = ?, fechado_por_nome = ?,
             fechado_em = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [status, inconsistenciasJson, ressalvaJson, conferenciaJson, fechadoPor, actor?.name || null, before.id]
      );
    } else {
      await tx.run(
        `INSERT INTO fechamento_mensal
          (ano, mes, status, inconsistencias_json, ressalva_json, conferencia_json, fechado_por, fechado_por_nome,
           fechado_em, tenant_id, unit_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, datetime('now'), datetime('now'))`,
        [periodo.ano, periodo.mes, status, inconsistenciasJson, ressalvaJson, conferenciaJson, fechadoPor, actor?.name || null,
          scope?.tenant_id || null, scope?.unit_id || null]
      );
    }

    const after = await obterFechamento(periodo.ano, periodo.mes, tx, scope);
    await AuditService.logAction({
      actor,
      action: ressalva ? 'fechar_periodo_com_ressalva' : 'fechar_periodo',
      module: 'fechamento_mensal',
      recordType: 'fechamento_mensal',
      recordId: after.id,
      before,
      after,
      metadata: { inconsistencias_total: analise.inconsistencias.length, ressalva },
      tenant_id: scope?.tenant_id,
      unit_id: scope?.unit_id,
    }, tx);

    return { fechamento: publicarFechamento(after), analise };
  });
}

async function reabrirPeriodo(ano, mes, actor, scope, motivo) {
  if (!actor?.role || !roleHasPermission(actor.role, PERMISSIONS.FECHAMENTO_REABRIR)) {
    throw new AppError('Somente o dono pode reabrir o fechamento mensal', 403, 'PERMISSAO_NEGADA');
  }

  const justificativa = typeof motivo === 'string' ? motivo.trim() : '';
  if (!justificativa) throw new AppError('Informe o motivo da reabertura', 400, 'MOTIVO_OBRIGATORIO');

  return runTransaction(async (tx) => {
    const periodo = validarPeriodo(ano, mes);
    const before = await obterFechamento(periodo.ano, periodo.mes, tx, scope);
    if (!before) throw new AppError('Fechamento nao encontrado', 404, 'FECHAMENTO_NAO_ENCONTRADO');

    await tx.run(
      `UPDATE fechamento_mensal
       SET status = ?, reaberto_em = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [FECHAMENTO_STATUS.REABERTO, before.id]
    );

    const after = await obterFechamento(periodo.ano, periodo.mes, tx, scope);
    await AuditService.logAction({
      actor,
      action: 'reabrir_periodo',
      metadata: { motivo: justificativa },
      module: 'fechamento_mensal',
      recordType: 'fechamento_mensal',
      recordId: after.id,
      before,
      after,
      tenant_id: scope?.tenant_id,
      unit_id: scope?.unit_id,
    }, tx);

    return after;
  });
}

module.exports = {
  situacaoDoPeriodo,
  listarFechamentos,
  listarResponsaveis,
  periodoDeData,
  assertPeriodoEditavelPorData,
  analisarPeriodo,
  fecharPeriodo,
  reabrirPeriodo,
};
