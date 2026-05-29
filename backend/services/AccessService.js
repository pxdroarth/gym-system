const { runGet, runExecute, runQuery } = require('../dbHelper');
const AppError = require('../errors/AppError');
const {
  ACESSO_RESULTADO,
  ACESSO_RESULTADO_VALUES,
  ACESSO_STATUS,
  MENSALIDADE_STATUS,
  VINCULO_STATUS,
} = require('../constants/domainStates');
const { PERMISSIONS, roleHasPermission } = require('../constants/userRoles');
const AuditService = require('./AuditService');

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

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function dataISO(value) {
  if (!value || value === '0000-00-00') return null;
  return String(value).slice(0, 10);
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

async function listarMensalidadesAcesso(alunoId, scope = null) {
  const scoped = scope?.tenant_id && scope?.unit_id
    ? 'AND tenant_id = ? AND unit_id = ?'
    : '';
  const params = [alunoId];
  if (scope?.tenant_id && scope?.unit_id) params.push(scope.tenant_id, scope.unit_id);
  return runQuery(
    `SELECT *
     FROM mensalidade
     WHERE aluno_id = ?
       ${scoped}
       AND deleted_at IS NULL
     ORDER BY
       DATE(COALESCE(vencimento, data_fim, data_inicio, '1900-01-01')) DESC,
       id DESC`,
    params
  );
}

function mensalidadeNoPeriodoAtual(mensalidade) {
  const hoje = hojeISO();
  const inicio = dataISO(mensalidade.data_inicio);
  const fim = dataISO(mensalidade.data_fim);
  const vencimento = dataISO(mensalidade.vencimento);

  if (vencimento && vencimento >= hoje) return true;
  if (inicio && fim) return inicio <= hoje && fim >= hoje;
  if (fim) return fim >= hoje;
  return false;
}

function motivoInadimplencia(vinculo) {
  return vinculo ? 'responsavel_inadimplente' : 'mensalidade_vencida';
}

function respostaBloqueada(status, motivo, aluno, responsavel_id = null) {
  return {
    ok: false,
    status,
    resultado: ACESSO_RESULTADO.NEGADO,
    motivo,
    aluno,
    responsavel_id,
  };
}

async function avaliarAcessoAluno(alunoId, options = {}) {
  const id = Number(alunoId);
  if (!id) throw new AppError('aluno_id e obrigatorio', 400, 'ALUNO_ID_INVALIDO');

  const aluno = await carregarAluno(id, options.scope);
  if (!aluno) {
    return respostaBloqueada(ACESSO_STATUS.BLOQUEADO_INATIVO, 'aluno_inativo', null);
  }

  const statusAluno = (aluno.status || '').toLowerCase();
  if (statusAluno !== 'ativo') {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_INATIVO,
      statusAluno === 'bloqueado' ? 'aluno_bloqueado' : 'aluno_inativo',
      aluno
    );
  }

  const vinculo = await carregarVinculo(id, options.scope);
  if (vinculo?.status === VINCULO_STATUS.PENDENTE_REGULARIZACAO) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_PENDENTE_REGULARIZACAO,
      'vinculo_irregular',
      aluno,
      vinculo.responsavel_id
    );
  }

  const idFinanceiro = vinculo ? vinculo.responsavel_id : id;
  const responsavel = vinculo ? await carregarAluno(idFinanceiro, options.scope) : aluno;

  if (!responsavel) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_PENDENTE_REGULARIZACAO,
      'vinculo_irregular',
      aluno,
      vinculo.responsavel_id
    );
  }

  const statusResponsavel = (responsavel.status || '').toLowerCase();
  if (statusResponsavel !== 'ativo') {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_INATIVO,
      vinculo ? 'vinculo_irregular' : (statusResponsavel === 'bloqueado' ? 'aluno_bloqueado' : 'aluno_inativo'),
      aluno,
      vinculo ? vinculo.responsavel_id : null
    );
  }

  const mensalidades = await listarMensalidadesAcesso(idFinanceiro, options.scope);
  const responsavel_id = vinculo ? vinculo.responsavel_id : null;

  if (!mensalidades.length) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
      'sem_mensalidade_registrada',
      aluno,
      responsavel_id
    );
  }

  const mensalidadeVencida = mensalidades.find((mensalidade) => (
    mensalidade.status === MENSALIDADE_STATUS.VENCIDO
    || (
      [MENSALIDADE_STATUS.EM_ABERTO, MENSALIDADE_STATUS.PARCIAL].includes(mensalidade.status)
      && estaVencida(mensalidade.vencimento)
    )
  ));

  if (mensalidadeVencida) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
      motivoInadimplencia(vinculo),
      aluno,
      responsavel_id
    );
  }

  const mensalidadeVigente = mensalidades.find(mensalidadeNoPeriodoAtual);

  if (!mensalidadeVigente) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
      'sem_mensalidade_vigente',
      aluno,
      responsavel_id
    );
  }

  if (mensalidadeVigente.status === MENSALIDADE_STATUS.CANCELADO) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
      'sem_mensalidade_vigente',
      aluno,
      responsavel_id
    );
  }

  if (mensalidadeVigente.status === MENSALIDADE_STATUS.BLOQUEADA_POR_FECHAMENTO) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_PENDENTE_REGULARIZACAO,
      'vinculo_irregular',
      aluno,
      responsavel_id
    );
  }

  if (mensalidadeVigente.status !== MENSALIDADE_STATUS.PAGO) {
    return respostaBloqueada(
      ACESSO_STATUS.BLOQUEADO_INADIMPLENCIA,
      'sem_cobertura_paga_vigente',
      aluno,
      responsavel_id
    );
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

/**
 * Registra a tentativa de acesso na mesma ordem usada pela decisao de dominio:
 * aluno e status operacional, vinculo/responsavel financeiro, mensalidade
 * vigente, bloqueios e, por fim, auditoria de excecoes manuais.
 */
async function registrarTentativaAcesso(alunoId, options = {}) {
  const avaliacao = await avaliarAcessoAluno(alunoId, { ...options, liberacaoManual: false });

  if (options.liberacaoManual) {
    if (!options.actor?.role || !roleHasPermission(options.actor.role, PERMISSIONS.ACESSO_LIBERACAO_MANUAL)) {
      throw new AppError('Permissao negada para liberacao manual de acesso', 403, 'PERMISSAO_NEGADA');
    }

    const motivoManual = String(options.motivo || '').trim();
    if (!motivoManual || !options.operador) {
      throw new AppError('Liberacao manual exige motivo e operador', 400, 'LIBERACAO_MANUAL_INVALIDA');
    }

    if (avaliacao.ok) {
      throw new AppError('Liberacao manual so pode ser usada quando o acesso automatico estiver bloqueado', 400, 'LIBERACAO_MANUAL_SEM_BLOQUEIO');
    }

    const acessoManual = await registrarAcesso({
      aluno_id: alunoId,
      resultado: ACESSO_RESULTADO.PERMITIDO,
      motivo_bloqueio: avaliacao.motivo || null,
    }, options.scope);

    const avaliacaoManual = {
      ok: true,
      status: ACESSO_STATUS.LIBERADO_MANUAL,
      resultado: ACESSO_RESULTADO.PERMITIDO,
      motivo: 'liberacao_manual',
      motivo_manual: motivoManual,
      motivo_bloqueio_original: avaliacao.motivo || null,
      operador: options.operador,
      responsavel_id: avaliacao.responsavel_id || null,
    };

    await AuditService.logAction({
      actor: options.actor,
      action: 'acesso_liberado_manual',
      module: 'acessos',
      recordType: 'acesso',
      recordId: acessoManual.id,
      before: {
        resultado_anterior: ACESSO_RESULTADO.NEGADO,
        avaliacao_original: avaliacao,
      },
      after: {
        acesso: acessoManual,
        avaliacao: avaliacaoManual,
      },
      metadata: {
        operador_id: options.actor?.id || null,
        operador_nome: options.actor?.name || options.operador || null,
        operador_login: options.actor?.login || null,
        aluno_id: Number(alunoId),
        motivo: motivoManual,
        resultado_anterior: 'bloqueado',
        motivo_bloqueio_original: avaliacao.motivo || null,
        unit_id: options.scope?.unit_id || null,
        tenant_id: options.scope?.tenant_id || null,
        timestamp: new Date().toISOString(),
      },
      tenant_id: options.scope?.tenant_id || null,
      unit_id: options.scope?.unit_id || null,
    });

    return {
      mensagem: 'Acesso permitido por liberacao manual auditada.',
      acesso: acessoManual,
      avaliacao: avaliacaoManual,
    };
  }

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
