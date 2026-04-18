const { runQuery, runGet, runExecute, runTransaction } = require('../dbHelper');
const AppError = require('../errors/AppError');
const AuditService = require('./AuditService');
const FechamentoMensalService = require('./FechamentoMensalService');
const { VINCULO_STATUS } = require('../constants/domainStates');

function clientOrDefault(client) {
  return client || { all: runQuery, get: runGet, run: runExecute };
}

function maxVinculados(qtdMaxPessoas) {
  return Math.max(0, Number(qtdMaxPessoas || 1) - 1);
}

async function carregarResponsavel(responsavelId, client = null) {
  const db = clientOrDefault(client);
  return db.get(`
    SELECT a.id, a.nome, a.matricula, a.status, a.plano_id,
           p.nome AS plano_nome,
           p.compartilhado,
           p.quantidade_max_pessoas,
           p.valor_base,
           p.duracao_em_dias
    FROM aluno a
    LEFT JOIN plano p ON p.id = a.plano_id
    WHERE a.id = ?
  `, [responsavelId]);
}

async function listarTodos(client = null) {
  const db = clientOrDefault(client);
  const associados = await db.all(`
    SELECT
      pa.id,
      pa.aluno_id,
      pa.responsavel_id,
      COALESCE(pa.status, 'ativo') AS status,
      pa.encerrado_em,
      a.nome AS aluno_nome,
      a.matricula AS aluno_matricula,
      r.nome AS responsavel_nome,
      r.matricula AS responsavel_matricula,
      p.nome AS plano_nome,
      p.quantidade_max_pessoas
    FROM plano_associado pa
    JOIN aluno a ON a.id = pa.aluno_id
    JOIN aluno r ON r.id = pa.responsavel_id
    LEFT JOIN plano p ON p.id = r.plano_id
    WHERE COALESCE(pa.status, 'ativo') != ?
    ORDER BY r.nome ASC, a.nome ASC
  `, [VINCULO_STATUS.ENCERRADO]);
  return { associados };
}

async function listarPorResponsavel(responsavelId, client = null) {
  const db = clientOrDefault(client);
  const associados = await db.all(`
    SELECT pa.id, a.id AS aluno_id, a.nome, a.matricula, COALESCE(pa.status, 'ativo') AS status
    FROM plano_associado pa
    JOIN aluno a ON a.id = pa.aluno_id
    WHERE pa.responsavel_id = ?
      AND COALESCE(pa.status, 'ativo') != ?
    ORDER BY a.nome ASC
  `, [responsavelId, VINCULO_STATUS.ENCERRADO]);
  return { associados };
}

async function detalheResponsavel(responsavelId, client = null) {
  const db = clientOrDefault(client);
  const responsavel = await carregarResponsavel(responsavelId, db);
  if (!responsavel) throw new AppError('Responsavel nao encontrado', 404, 'RESPONSAVEL_NAO_ENCONTRADO');

  const { associados: vinculados } = await listarPorResponsavel(responsavelId, db);
  const limite_vinculados = maxVinculados(responsavel.quantidade_max_pessoas);

  return {
    responsavel,
    limite_vinculados,
    total_vinculados: vinculados.length,
    vagas_restantes: Math.max(0, limite_vinculados - vinculados.length),
    vinculados,
  };
}

async function criarVinculo(payload = {}, actor) {
  const alunoId = parseInt(payload.aluno_id);
  const responsavelId = parseInt(payload.responsavel_id);

  if (!alunoId || !responsavelId) {
    throw new AppError('Campos obrigatorios: aluno_id e responsavel_id', 400, 'VINCULO_PAYLOAD_INVALIDO');
  }
  if (alunoId === responsavelId) {
    throw new AppError('Aluno nao pode ser responsavel por si mesmo', 400, 'VINCULO_AUTORREFERENTE');
  }

  return runTransaction(async (tx) => {
    await FechamentoMensalService.assertPeriodoEditavelPorData(new Date().toISOString().slice(0, 10), 'alteracao de vinculo', tx);

    const aluno = await tx.get('SELECT * FROM aluno WHERE id = ?', [alunoId]);
    const responsavel = await carregarResponsavel(responsavelId, tx);

    if (!aluno) throw new AppError('Aluno nao encontrado', 404, 'ALUNO_NAO_ENCONTRADO');
    if (!responsavel) throw new AppError('Responsavel nao encontrado', 404, 'RESPONSAVEL_NAO_ENCONTRADO');
    if ((aluno.status || '').toLowerCase() !== 'ativo') throw new AppError('Aluno a vincular precisa estar ativo', 400, 'ALUNO_INATIVO');
    if ((responsavel.status || '').toLowerCase() !== 'ativo') throw new AppError('Responsavel precisa estar ativo', 400, 'RESPONSAVEL_INATIVO');
    if (!responsavel.plano_id) throw new AppError('Responsavel precisa possuir um plano', 400, 'RESPONSAVEL_SEM_PLANO');
    if (Number(responsavel.compartilhado || 0) !== 1) throw new AppError('Plano do responsavel nao permite vinculados', 400, 'PLANO_NAO_COMPARTILHADO');

    const limite = maxVinculados(responsavel.quantidade_max_pessoas);
    if (limite <= 0) throw new AppError('Plano do responsavel nao possui vagas para vinculados', 400, 'SEM_VAGAS');

    const alunoEhResponsavel = await tx.get(
      `SELECT id FROM plano_associado
       WHERE responsavel_id = ? AND COALESCE(status, 'ativo') != ?
       LIMIT 1`,
      [alunoId, VINCULO_STATUS.ENCERRADO]
    );
    if (alunoEhResponsavel) {
      throw new AppError('Este aluno e responsavel por outros vinculos e nao pode ser vinculado', 400, 'ALUNO_EH_RESPONSAVEL');
    }

    const mensalidadeAberta = await tx.get(
      `SELECT id FROM mensalidade WHERE aluno_id = ? AND status = 'em_aberto' LIMIT 1`,
      [alunoId]
    );
    if (mensalidadeAberta) {
      throw new AppError('Aluno possui mensalidade em aberto e nao pode ser vinculado ate regularizar', 400, 'ALUNO_COM_MENSALIDADE_ABERTA');
    }

    const vinculoAtual = await tx.get(
      `SELECT * FROM plano_associado
       WHERE aluno_id = ? AND COALESCE(status, 'ativo') != ?
       LIMIT 1`,
      [alunoId, VINCULO_STATUS.ENCERRADO]
    );
    const totalAtual = await tx.get(
      `SELECT COUNT(*) AS total FROM plano_associado
       WHERE responsavel_id = ? AND COALESCE(status, 'ativo') != ?`,
      [responsavelId, VINCULO_STATUS.ENCERRADO]
    );
    const jaContaNoMesmoResponsavel = vinculoAtual && Number(vinculoAtual.responsavel_id) === responsavelId ? 1 : 0;
    const totalProjetado = (Number(totalAtual?.total || 0) - jaContaNoMesmoResponsavel) + 1;

    if (totalProjetado > limite) {
      throw new AppError(`O plano do responsavel permite no maximo ${limite} vinculado(s)`, 400, 'LIMITE_VINCULOS');
    }

    if (vinculoAtual) {
      await tx.run(
        `UPDATE plano_associado
         SET status = ?, encerrado_em = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [VINCULO_STATUS.ENCERRADO, vinculoAtual.id]
      );
    }

    const result = await tx.run(
      `INSERT INTO plano_associado (aluno_id, responsavel_id, status, created_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      [alunoId, responsavelId, VINCULO_STATUS.ATIVO]
    );

    const vinculoCriado = await tx.get('SELECT * FROM plano_associado WHERE id = ?', [result.lastID]);
    await AuditService.logAction({
      actor,
      action: 'criar_vinculo',
      module: 'vinculos',
      recordType: 'plano_associado',
      recordId: result.lastID,
      before: vinculoAtual || null,
      after: vinculoCriado,
    }, tx);

    return {
      id: result.lastID || null,
      aluno_id: alunoId,
      responsavel_id: responsavelId,
      status: VINCULO_STATUS.ATIVO,
      message: 'Vinculo criado com sucesso',
    };
  });
}

async function encerrarVinculo(id, actor) {
  const vinculoId = parseInt(id);
  if (!vinculoId) throw new AppError('ID invalido', 400, 'VINCULO_ID_INVALIDO');

  return runTransaction(async (tx) => {
    await FechamentoMensalService.assertPeriodoEditavelPorData(new Date().toISOString().slice(0, 10), 'alteracao de vinculo', tx);

    const before = await tx.get('SELECT * FROM plano_associado WHERE id = ?', [vinculoId]);
    if (!before || before.status === VINCULO_STATUS.ENCERRADO) {
      throw new AppError('Vinculo nao encontrado', 404, 'VINCULO_NAO_ENCONTRADO');
    }

    await tx.run(
      `UPDATE plano_associado
       SET status = ?, encerrado_em = datetime('now'), updated_at = datetime('now')
       WHERE id = ?`,
      [VINCULO_STATUS.ENCERRADO, vinculoId]
    );

    const after = await tx.get('SELECT * FROM plano_associado WHERE id = ?', [vinculoId]);
    await AuditService.logAction({
      actor,
      action: 'encerrar_vinculo',
      module: 'vinculos',
      recordType: 'plano_associado',
      recordId: vinculoId,
      before,
      after,
    }, tx);

    return { sucesso: true };
  });
}

async function marcarDependentesPendenteRegularizacao(responsavelId, actor, client = null) {
  const db = clientOrDefault(client);
  const before = await db.all(
    `SELECT * FROM plano_associado
     WHERE responsavel_id = ? AND COALESCE(status, 'ativo') = ?`,
    [responsavelId, VINCULO_STATUS.ATIVO]
  );

  if (!before.length) return { alterados: 0 };

  await db.run(
    `UPDATE plano_associado
     SET status = ?, updated_at = datetime('now')
     WHERE responsavel_id = ? AND COALESCE(status, 'ativo') = ?`,
    [VINCULO_STATUS.PENDENTE_REGULARIZACAO, responsavelId, VINCULO_STATUS.ATIVO]
  );

  const after = await db.all(
    `SELECT * FROM plano_associado
     WHERE responsavel_id = ? AND status = ?`,
    [responsavelId, VINCULO_STATUS.PENDENTE_REGULARIZACAO]
  );

  await AuditService.logAction({
    actor,
    action: 'marcar_dependentes_pendente_regularizacao',
    module: 'vinculos',
    recordType: 'aluno',
    recordId: responsavelId,
    before,
    after,
    metadata: { responsavel_id: responsavelId },
  }, db);

  return { alterados: before.length };
}

module.exports = {
  carregarResponsavel,
  listarTodos,
  listarPorResponsavel,
  detalheResponsavel,
  criarVinculo,
  encerrarVinculo,
  marcarDependentesPendenteRegularizacao,
};
