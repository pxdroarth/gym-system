const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');

async function avaliarAcessoAluno(alunoId) {
  const aluno = await runGet('SELECT * FROM aluno WHERE id = ?', [alunoId]);
  if (!aluno) return { ok: false, status: 'negado', motivo: 'Aluno não encontrado' };

  if ((aluno.status || '').toLowerCase() !== 'ativo') {
    return { ok: false, status: 'negado', motivo: 'Cadastro inativo' };
  }

  const vinculo = await runGet(
    `SELECT responsavel_id FROM plano_associado WHERE aluno_id = ? LIMIT 1`,
    [alunoId]
  );

  const idFinanceiro = vinculo ? vinculo.responsavel_id : alunoId;
  const responsavel = await runGet('SELECT * FROM aluno WHERE id = ?', [idFinanceiro]);

  if (!responsavel) {
    return { ok: false, status: 'negado', motivo: 'Responsável não encontrado' };
  }

  if ((responsavel.status || '').toLowerCase() !== 'ativo') {
    return { ok: false, status: 'negado', motivo: vinculo ? 'Responsável inativo' : 'Cadastro inativo' };
  }

  const debito = await runGet(
    `SELECT id FROM mensalidade
     WHERE aluno_id = ?
       AND status = 'em_aberto'
       AND vencimento IS NOT NULL
       AND vencimento != '0000-00-00'
       AND DATE(vencimento) <= DATE('now')
     ORDER BY DATE(vencimento) ASC
     LIMIT 1`,
    [idFinanceiro]
  );

  if (debito) {
    return {
      ok: false,
      status: 'negado',
      motivo: vinculo ? 'Responsável inadimplente' : 'Inadimplente',
      responsavel_id: vinculo ? vinculo.responsavel_id : null,
    };
  }

  return {
    ok: true,
    status: 'permitido',
    motivo: null,
    aluno,
    responsavel_id: vinculo ? vinculo.responsavel_id : null,
  };
}

router.get('/', async (_req, res) => {
  try {
    const rows = await runQuery(`
      SELECT ac.*, a.nome AS aluno_nome
      FROM acesso ac
      LEFT JOIN aluno a ON a.id = ac.aluno_id
      ORDER BY datetime(ac.data_hora) DESC, ac.id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/aluno/:alunoId', async (req, res) => {
  const alunoId = parseInt(req.params.alunoId);
  const pagina = parseInt(req.query.pagina) || 1;
  const limite = parseInt(req.query.limite) || 10;

  if (isNaN(alunoId) || alunoId <= 0) {
    return res.status(400).json({ error: 'ID de aluno inválido' });
  }

  const offset = (pagina - 1) * limite;

  try {
    const totalRow = await runGet('SELECT COUNT(*) as total FROM acesso WHERE aluno_id = ?', [alunoId]);
    const total = totalRow?.total || 0;

    const acessos = await runQuery(
      'SELECT * FROM acesso WHERE aluno_id = ? ORDER BY datetime(data_hora) DESC, id DESC LIMIT ? OFFSET ?',
      [alunoId, limite, offset]
    );

    res.json({ acessos, total, pagina, limite });
  } catch (error) {
    console.error('Erro ao listar acessos:', error.message);
    res.status(500).json({ error: 'Erro ao listar acessos' });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const row = await runGet('SELECT * FROM acesso WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'Acesso não encontrado' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  const { aluno_id, data_hora, resultado, motivo_bloqueio } = req.body;

  if (!aluno_id || !resultado) {
    return res.status(400).json({ error: 'Campos obrigatórios: aluno_id e resultado' });
  }

  const resultadoValido = ['permitido', 'negado'];
  const resultadoNormalizado = String(resultado).toLowerCase();

  if (!resultadoValido.includes(resultadoNormalizado)) {
    return res.status(400).json({
      error: `Resultado inválido. Valores válidos: ${resultadoValido.join(', ')}`
    });
  }

  const dataHoraParaInserir = data_hora ? new Date(data_hora).toISOString() : new Date().toISOString();

  try {
    const result = await runExecute(
      'INSERT INTO acesso (aluno_id, data_hora, resultado, motivo_bloqueio) VALUES (?, ?, ?, ?)',
      [aluno_id, dataHoraParaInserir, resultadoNormalizado, motivo_bloqueio || null]
    );

    res.status(201).json({
      id: result.lastID,
      aluno_id,
      data_hora: dataHoraParaInserir,
      resultado: resultadoNormalizado,
      motivo_bloqueio: motivo_bloqueio || null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { aluno_id, data_hora, resultado, motivo_bloqueio } = req.body;

  if (!aluno_id || !resultado || !data_hora) {
    return res.status(400).json({ error: 'Campos obrigatórios: aluno_id, resultado, data_hora' });
  }

  const resultadoValido = ['permitido', 'negado'];
  const resultadoNormalizado = String(resultado).toLowerCase();

  if (!resultadoValido.includes(resultadoNormalizado)) {
    return res.status(400).json({
      error: `Resultado inválido. Valores válidos: ${resultadoValido.join(', ')}`
    });
  }

  try {
    const result = await runExecute(
      'UPDATE acesso SET aluno_id = ?, data_hora = ?, resultado = ?, motivo_bloqueio = ? WHERE id = ?',
      [aluno_id, data_hora, resultadoNormalizado, motivo_bloqueio || null, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Acesso não encontrado para atualizar' });
    }

    res.json({ id, aluno_id, data_hora, resultado: resultadoNormalizado, motivo_bloqueio: motivo_bloqueio || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await runExecute('DELETE FROM acesso WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Acesso não encontrado para deletar' });
    res.json({ message: 'Acesso deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/mock-hikvision', async (req, res) => {
  const { aluno_id } = req.body;

  if (!aluno_id) {
    return res.status(400).json({ error: 'aluno_id é obrigatório' });
  }

  try {
    const avaliacao = await avaliarAcessoAluno(aluno_id);
    const dataHoraAtual = new Date().toISOString();
    const resultadoBanco = avaliacao.ok ? 'permitido' : 'negado';

    const result = await runExecute(
      'INSERT INTO acesso (aluno_id, data_hora, resultado, motivo_bloqueio) VALUES (?, ?, ?, ?)',
      [aluno_id, dataHoraAtual, resultadoBanco, avaliacao.motivo || null]
    );

    return res.status(201).json({
      mensagem: `Acesso ${resultadoBanco} registrado com sucesso.`,
      acesso: {
        id: result.lastID,
        aluno_id,
        data_hora: dataHoraAtual,
        resultado: resultadoBanco,
        motivo_bloqueio: avaliacao.motivo || null
      },
      avaliacao
    });
  } catch (error) {
    console.error('Erro ao simular acesso do Hikvision:', error);
    return res.status(500).json({
      error: 'Erro ao simular acesso do Hikvision',
      detalhe: error.message
    });
  }
});

module.exports = router;
