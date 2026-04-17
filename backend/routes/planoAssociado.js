const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');

function maxVinculados(qtdMaxPessoas) {
  return Math.max(0, Number(qtdMaxPessoas || 1) - 1);
}

async function carregarResponsavel(responsavelId) {
  return runGet(`
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

router.get('/', async (_req, res) => {
  try {
    const associados = await runQuery(`
      SELECT 
        pa.id,
        pa.aluno_id,
        pa.responsavel_id,
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
      ORDER BY r.nome ASC, a.nome ASC
    `);
    res.json({ associados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Compatível com a rota antiga: lista somente os vinculados do responsável
router.get('/:responsavelId', async (req, res) => {
  const responsavelId = parseInt(req.params.responsavelId);
  if (!responsavelId) return res.status(400).json({ error: 'Responsável inválido' });

  try {
    const associados = await runQuery(`
      SELECT pa.id, a.id AS aluno_id, a.nome, a.matricula
      FROM plano_associado pa
      JOIN aluno a ON a.id = pa.aluno_id
      WHERE pa.responsavel_id = ?
      ORDER BY a.nome ASC
    `, [responsavelId]);
    res.json({ associados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/responsavel/:responsavelId/detalhe', async (req, res) => {
  const responsavelId = parseInt(req.params.responsavelId);
  if (!responsavelId) return res.status(400).json({ error: 'Responsável inválido' });

  try {
    const responsavel = await carregarResponsavel(responsavelId);
    if (!responsavel) return res.status(404).json({ error: 'Responsável não encontrado' });

    const vinculados = await runQuery(`
      SELECT pa.id, a.id AS aluno_id, a.nome, a.matricula, a.status
      FROM plano_associado pa
      JOIN aluno a ON a.id = pa.aluno_id
      WHERE pa.responsavel_id = ?
      ORDER BY a.nome ASC
    `, [responsavelId]);

    const limite_vinculados = maxVinculados(responsavel.quantidade_max_pessoas);

    res.json({
      responsavel,
      limite_vinculados,
      total_vinculados: vinculados.length,
      vagas_restantes: Math.max(0, limite_vinculados - vinculados.length),
      vinculados,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { aluno_id, responsavel_id } = req.body || {};
  const alunoId = parseInt(aluno_id);
  const responsavelId = parseInt(responsavel_id);

  if (!alunoId || !responsavelId) {
    return res.status(400).json({ error: 'Campos obrigatórios: aluno_id e responsavel_id' });
  }
  if (alunoId === responsavelId) {
    return res.status(400).json({ error: 'Aluno não pode ser responsável por si mesmo' });
  }

  try {
    const aluno = await runGet('SELECT * FROM aluno WHERE id = ?', [alunoId]);
    const responsavel = await carregarResponsavel(responsavelId);

    if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado' });
    if (!responsavel) return res.status(404).json({ error: 'Responsável não encontrado' });
    if ((aluno.status || '').toLowerCase() !== 'ativo') return res.status(400).json({ error: 'Aluno a vincular precisa estar ativo' });
    if ((responsavel.status || '').toLowerCase() !== 'ativo') return res.status(400).json({ error: 'Responsável precisa estar ativo' });
    if (!responsavel.plano_id) return res.status(400).json({ error: 'Responsável precisa possuir um plano' });
    if (Number(responsavel.compartilhado || 0) !== 1) return res.status(400).json({ error: 'Plano do responsável não permite vinculados' });

    const limite = maxVinculados(responsavel.quantidade_max_pessoas);
    if (limite <= 0) return res.status(400).json({ error: 'Plano do responsável não possui vagas para vinculados' });

    const alunoEhResponsavel = await runGet('SELECT id FROM plano_associado WHERE responsavel_id = ? LIMIT 1', [alunoId]);
    if (alunoEhResponsavel) {
      return res.status(400).json({ error: 'Este aluno é responsável por outros vínculos e não pode ser vinculado' });
    }

    const mensalidadeAberta = await runGet(
      `SELECT id FROM mensalidade WHERE aluno_id = ? AND status = 'em_aberto' LIMIT 1`,
      [alunoId]
    );
    if (mensalidadeAberta) {
      return res.status(400).json({ error: 'Aluno possui mensalidade em aberto e não pode ser vinculado até regularizar' });
    }

    const vinculoAtual = await runGet('SELECT * FROM plano_associado WHERE aluno_id = ? LIMIT 1', [alunoId]);
    const totalAtual = await runGet('SELECT COUNT(*) AS total FROM plano_associado WHERE responsavel_id = ?', [responsavelId]);
    const jaContaNoMesmoResponsavel = vinculoAtual && Number(vinculoAtual.responsavel_id) === responsavelId ? 1 : 0;
    const totalProjetado = (Number(totalAtual?.total || 0) - jaContaNoMesmoResponsavel) + 1;

    if (totalProjetado > limite) {
      return res.status(400).json({ error: `O plano do responsável permite no máximo ${limite} vinculado(s)` });
    }

    await runExecute('DELETE FROM plano_associado WHERE aluno_id = ?', [alunoId]);

    const result = await runExecute(
      'INSERT INTO plano_associado (aluno_id, responsavel_id) VALUES (?, ?)',
      [alunoId, responsavelId]
    );

    res.status(201).json({
      id: result.lastID || null,
      aluno_id: alunoId,
      responsavel_id: responsavelId,
      message: 'Vínculo criado com sucesso'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const result = await runExecute('DELETE FROM plano_associado WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Vínculo não encontrado' });
    res.json({ sucesso: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
