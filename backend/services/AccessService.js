const { runGet, runExecute } = require('../dbHelper');
const AppError = require('../errors/AppError');
const {
  ACESSO_RESULTADO,
  ACESSO_RESULTADO_VALUES,
  ACESSO_STATUS,
  MENSALIDADE_STATUS,
  VINCULO_STATUS,
} = require('../constants/domainStates');
const { PERMISSIONS, roleHasPermission } = require('../constants/userRoles');

function resultadoBancoPorStatus(status) {
  return [
    ACESSO_STATUS.LIBERADO,
    ACESSO_STATUS.LIBERADO_COM_RESTRICAO,
    ACESSO_STATUS.LIBERADO_MANUAL,
  ].includes(status)
    ? ACESSO_RESULTADO.PERMITIDO
    : ACESSO_RESULTADO.NEGADO;
}

function normalizarDataHora(dataHora) {
  return dataHora ? new Date(dataHora).toISOString() : new Date().toISOString();
}

function estaVencida(vencimento) {
  if (!vencimento || vencimento === '0000-00-00') return false;

  const hoje = new Date().toISOString().slice(0, 10);
  return String(vencimento).slice(0, 10) < hoje;
}

async function carregarAluno(alunoId, scope = null) {
  if (scope?.tenant_id && scope?.unit_id) {
    return runGet('SELECT * FROM aluno WHERE id = ? AND tenant_id = ? AND unit_id = ?', [alunoId, scope.tenant_id, scope.unit_id]);
  }
  return runGet('SELECT * FROM aluno WHERE id = ?', [alunoId]);
}

async function carregarVinculo(alunoId, scope = null) {
  const scoped = scope?.tenant_id && scope?.unit_id
    ? 'AND tenant_id = ? AND unit_id = ?'
    : '';
  const params = scope?.tenant_id && scope?.unit_id
    ? [alunoId, VINCULO_STATUS.ENCERRADO, scope.tenant_id, scope.unit_id]
    : [alunoId, VINCULO_STATUS.ENCERRADO];
  return runGet(
    `SELECT responsavel_id, COALESCE(status, 'ativo') AS status
     FROM plano_associado
     WHERE aluno_id = ?
       AND COALESCE(status, 'ativo') != ?
       ${scoped}
     LIMIT 1`,
    params
  );
}

async function buscarMensalidadeCritica(alunoId, scope = null) {
  const scoped = scope?.tenant_id && scope?.unit_id
    ? 'AND tenant_id = ? AND unit_id = ?'
    : '';
  const params = [
    alunoId,
    MENSALIDADE_STATUS.CANCELADO,
  ];
  if (scope?.tenant_id && scope?.unit_id) params.push(scope.tenant_id, scope.unit_id);
  params.push(
    MENSALIDADE_STATUS.BLOQUEADA_POR_FECHAMENTO,
    MENSALIDADE_STATUS.EM_ABERTO,
    MENSALIDADE_STATUS.VENCIDO,
    MENSALIDADE_STATUS.PARCIAL,
    MENSALIDADE_STATUS.EM_REVERSAO_CONTROLADA,
  );
  return runGet(
    `SELECT *
     FROM mensalidade
     WHERE aluno_id = ?
       AND status != ?
       ${scoped}
     ORDER BY
       CASE
         WHEN status = ? THEN 1
         WHEN status = ? AND vencimento IS NOT NULL AND vencimento != '0000-00-00' AND DATE(vencimento) < DATE('now') THEN 2
         WHEN status = ? THEN 3
         WHEN status = ? THEN 4
         WHEN status = ? THEN 5
         ELSE 6
       END,
       DATE(vencimento) ASC,
       id ASC
     LIMIT 1`,
    params
  );
}

async function avaliarAcessoAluno(alunoId, options = {}) {
  const id = Number(alunoId);
  if (!id) throw new AppError('aluno_id e obrigatorio', 400, 'ALUNO_ID_INVALIDO');

  if (options.liberacaoManual) {
    if (!options.actor?.role || !roleHasPermission(options.actor.role, PERMISSIONS.ACESSO_LIBERACAO_MANUAL)) {
      throw new AppError('Permissao negada para liberacao manual de acesso', 403, 'PERMISSAO_NEGADA');
    }

    if (!options.motivo || !options.operador) {
      throw new AppError('Liberacao manual exige motivo e operador', 400, 'LIBERACAO_MANUAL_INVALIDA');
    }

    return {
      ok: true,
      status: ACESSO_STATUS.LIBERADO_MANUAL,
      resultado: ACESSO_RESULTADO.PERMITIDO,
      motivo: options.motivo,
      operador: options.operador,
      responsavel_id: null,
    };
  }

  const aluno = await carregarAluno(id, options.scope);
  if (!aluno) {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_INATIVO,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: 'Aluno nao encontrado',
    };
  }

  if ((aluno.status || '').toLowerCase() !== 'ativo') {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_INATIVO,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: 'Cadastro inativo',
      aluno,
    };
  }

  const vinculo = await carregarVinculo(id, options.scope);
  if (vinculo?.status === VINCULO_STATUS.PENDENTE_REGULARIZACAO) {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_PENDENTE_REGULARIZACAO,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: 'Vinculo pendente de regularizacao',
      aluno,
      responsavel_id: vinculo.responsavel_id,
    };
  }

  const idFinanceiro = vinculo ? vinculo.responsavel_id : id;
  const responsavel = vinculo ? await carregarAluno(idFinanceiro, options.scope) : aluno;

  if (!responsavel) {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_PENDENTE_REGULARIZACAO,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: 'Responsavel nao encontrado',
      responsavel_id: vinculo.responsavel_id,
    };
  }

  if ((responsavel.status || '').toLowerCase() !== 'ativo') {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_INATIVO,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: vinculo ? 'Responsavel inativo' : 'Cadastro inativo',
      aluno,
      responsavel_id: vinculo ? vinculo.responsavel_id : null,
    };
  }

  const mensalidade = await buscarMensalidadeCritica(idFinanceiro, options.scope);
  const responsavel_id = vinculo ? vinculo.responsavel_id : null;

  if (!mensalidade) {
    return {
      ok: true,
      status: ACESSO_STATUS.LIBERADO,
      resultado: ACESSO_RESULTADO.PERMITIDO,
      motivo: null,
      aluno,
      responsavel_id,
    };
  }

  if (mensalidade.status === MENSALIDADE_STATUS.BLOQUEADA_POR_FECHAMENTO) {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_PENDENTE_REGULARIZACAO,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: 'Mensalidade bloqueada por fechamento',
      aluno,
      responsavel_id,
    };
  }

  if (mensalidade.status === MENSALIDADE_STATUS.VENCIDO) {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: vinculo ? 'Responsavel inadimplente' : 'Inadimplente',
      aluno,
      responsavel_id,
    };
  }

  if (
    mensalidade.status === MENSALIDADE_STATUS.EM_ABERTO &&
    estaVencida(mensalidade.vencimento)
  ) {
    return {
      ok: false,
      status: ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
      resultado: ACESSO_RESULTADO.NEGADO,
      motivo: vinculo ? 'Responsavel inadimplente' : 'Inadimplente',
      aluno,
      responsavel_id,
    };
  }

  if (mensalidade.status === MENSALIDADE_STATUS.PARCIAL) {
    if (estaVencida(mensalidade.vencimento)) {
      return {
        ok: false,
        status: ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
        resultado: ACESSO_RESULTADO.NEGADO,
        motivo: vinculo ? 'Responsavel inadimplente' : 'Inadimplente',
        aluno,
        responsavel_id,
      };
    }

    return {
      ok: true,
      status: ACESSO_STATUS.LIBERADO_COM_RESTRICAO,
      resultado: ACESSO_RESULTADO.PERMITIDO,
      motivo: 'Mensalidade parcial',
      aluno,
      responsavel_id,
    };
  }

  return {
    ok: true,
    status: ACESSO_STATUS.LIBERADO,
    resultado: ACESSO_RESULTADO.PERMITIDO,
    motivo: null,
    aluno,
    responsavel_id,
  };
}

async function registrarAcesso(payload = {}, scope = null) {
  const { aluno_id, data_hora, resultado, motivo_bloqueio } = payload;
  if (!aluno_id || !resultado) {
    throw new AppError('Campos obrigatorios: aluno_id e resultado', 400, 'ACESSO_PAYLOAD_INVALIDO');
  }

  const resultadoNormalizado = String(resultado).toLowerCase();
  if (!ACESSO_RESULTADO_VALUES.includes(resultadoNormalizado)) {
    throw new AppError(
      `Resultado invalido. Valores validos: ${ACESSO_RESULTADO_VALUES.join(', ')}`,
      400,
      'ACESSO_RESULTADO_INVALIDO'
    );
  }

  const aluno = await carregarAluno(aluno_id, scope);
  if (!aluno) {
    throw new AppError('Aluno nao encontrado na unidade atual', 404, 'ALUNO_NAO_ENCONTRADO_NO_ESCOPO');
  }

  const dataHoraParaInserir = normalizarDataHora(data_hora);
  const result = await runExecute(
    'INSERT INTO acesso (aluno_id, data_hora, resultado, motivo_bloqueio, tenant_id, unit_id) VALUES (?, ?, ?, ?, ?, ?)',
    [aluno_id, dataHoraParaInserir, resultadoNormalizado, motivo_bloqueio || null, scope?.tenant_id || null, scope?.unit_id || null]
  );

  return {
    id: result.lastID,
    aluno_id,
    data_hora: dataHoraParaInserir,
    resultado: resultadoNormalizado,
    motivo_bloqueio: motivo_bloqueio || null,
    tenant_id: scope?.tenant_id || null,
    unit_id: scope?.unit_id || null,
  };
}

async function registrarTentativaAcesso(alunoId, options = {}) {
  const avaliacao = await avaliarAcessoAluno(alunoId, options);
  const resultadoBanco = resultadoBancoPorStatus(avaliacao.status);
  const acesso = await registrarAcesso({
    aluno_id: alunoId,
    resultado: resultadoBanco,
    motivo_bloqueio: avaliacao.motivo || null,
  }, options.scope);

  return {
    mensagem: `Acesso ${resultadoBanco} registrado com sucesso.`,
    acesso,
    avaliacao,
  };
}

module.exports = {
  avaliarAcessoAluno,
  registrarAcesso,
  registrarTentativaAcesso,
  resultadoBancoPorStatus,
};
