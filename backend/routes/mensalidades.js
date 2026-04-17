const express = require('express');
const router = express.Router();
const { runGet, runExecute, runQuery } = require('../dbHelper');
const { sincronizarFinanceiro } = require('../services/FinanceService');

function isISODate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfCycle(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function buildDueDate(day, baseDateStr) {
  const base = new Date(`${baseDateStr}T12:00:00`);
  const year = base.getFullYear();
  const month = base.getMonth();
  const maxDay = new Date(year, month + 1, 0).getDate();
  const safeDay = Math.min(Math.max(Number(day) || 1, 1), maxDay);
  return new Date(year, month, safeDay).toISOString().slice(0, 10);
}

async function validarAlunoCobravel(alunoId) {
  const vinculo = await runGet(`SELECT responsavel_id FROM plano_associado WHERE aluno_id = ? LIMIT 1`, [alunoId]);
  if (vinculo) {
    return { ok: false, error: 'Aluno vinculado não pode possuir mensalidade própria. A cobrança deve ser feita no responsável.' };
  }
  return { ok: true };
}

router.post('/', async (req, res) => {
  try {
    const {
      aluno_id,
      plano_id,
      valor_cobrado,
      desconto_aplicado = 0,
      data_inicio,
      vencimento,
      observacoes = '',
      status = 'em_aberto'
    } = req.body || {};

    if (!aluno_id) {
      return res.status(400).json({ error: 'aluno_id é obrigatório' });
    }

    const aluno = await runGet('SELECT * FROM aluno WHERE id = ?', [aluno_id]);
    if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado' });

    const cobravel = await validarAlunoCobravel(aluno_id);
    if (!cobravel.ok) return res.status(400).json({ error: cobravel.error });

    const planoIdFinal = Number(plano_id || aluno.plano_id);
    if (!planoIdFinal) return res.status(400).json({ error: 'plano_id é obrigatório' });

    const plano = await runGet('SELECT * FROM plano WHERE id = ?', [planoIdFinal]);
    if (!plano) return res.status(400).json({ error: 'Plano não encontrado' });

    const hoje = new Date().toISOString().slice(0, 10);
    const venc = isISODate(vencimento) ? vencimento : buildDueDate(aluno.dia_vencimento, hoje);
    const inicioCiclo = isISODate(data_inicio) ? data_inicio : startOfCycle(venc);
    const dataFim = addDays(inicioCiclo, Math.max(0, Number(plano.duracao_em_dias || 30) - 1));

    const valorBase = toMoney(valor_cobrado ?? plano.valor_base ?? plano.valor);
    if (valorBase === null || valorBase <= 0) return res.status(400).json({ error: 'valor_cobrado inválido' });

    const desconto = toMoney(desconto_aplicado) ?? 0;
    if (desconto < 0) return res.status(400).json({ error: 'desconto_aplicado inválido' });
    if (desconto >= valorBase) return res.status(400).json({ error: 'desconto_aplicado não pode ser maior ou igual ao valor cobrado' });

    const statusNormalizado = String(status || 'em_aberto').toLowerCase();
    const statusPermitido = ['em_aberto', 'pago', 'cancelado'];
    if (!statusPermitido.includes(statusNormalizado)) {
      return res.status(400).json({ error: `status inválido. Use: ${statusPermitido.join(', ')}` });
    }

    const duplicada = await runGet(
      `SELECT id FROM mensalidade
       WHERE aluno_id = ?
         AND strftime('%Y-%m', vencimento) = strftime('%Y-%m', ?)
         AND status != 'cancelado'`,
      [aluno_id, venc]
    );
    if (duplicada) {
      return res.status(409).json({ error: 'Já existe mensalidade para este aluno neste ciclo' });
    }

    const result = await runExecute(
      `INSERT INTO mensalidade
        (aluno_id, plano_id, valor_cobrado, desconto_aplicado, status, data_inicio, data_fim, vencimento, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [aluno_id, planoIdFinal, valorBase, desconto, statusNormalizado, inicioCiclo, dataFim, venc, observacoes || '']
    );

    await sincronizarFinanceiro();

    const criada = await runGet('SELECT * FROM mensalidade WHERE id = ?', [result.lastID]);
    res.status(201).json(criada);
  } catch (error) {
    console.error('[ERRO POST mensalidades]', error);
    res.status(500).json({ error: 'Erro ao criar mensalidade' });
  }
});

router.get('/', async (req, res) => {
  try {
    let sql = `
      SELECT m.*, a.nome AS aluno_nome, p.nome AS plano_nome
      FROM mensalidade m
      LEFT JOIN aluno a ON a.id = m.aluno_id
      LEFT JOIN plano p ON p.id = m.plano_id
      WHERE 1=1`;
    const params = [];

    if (req.query.aluno_id) {
      sql += ' AND m.aluno_id = ?';
      params.push(req.query.aluno_id);
    }
    if (req.query.plano_id) {
      sql += ' AND m.plano_id = ?';
      params.push(req.query.plano_id);
    }
    if (req.query.status) {
      sql += ' AND m.status = ?';
      params.push(req.query.status);
    }
    if (req.query.vencimento_de) {
      sql += ' AND m.vencimento >= ?';
      params.push(req.query.vencimento_de);
    }
    if (req.query.vencimento_ate) {
      sql += ' AND m.vencimento <= ?';
      params.push(req.query.vencimento_ate);
    }

    sql += ' ORDER BY DATE(m.vencimento) DESC, m.id DESC';
    const rows = await runQuery(sql, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/alunos', async (_req, res) => {
  const alunos = await runQuery('SELECT * FROM aluno ORDER BY nome ASC');
  for (const aluno of alunos) {
    aluno.mensalidades = await runQuery(
      'SELECT * FROM mensalidade WHERE aluno_id = ? ORDER BY DATE(vencimento) DESC, id DESC',
      [aluno.id]
    );
  }
  res.json(alunos);
});

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { valor_cobrado, desconto_aplicado = 0, vencimento, observacoes = '', status } = req.body || {};
  try {
    const atual = await runGet('SELECT * FROM mensalidade WHERE id = ?', [id]);
    if (!atual) return res.status(404).json({ error: 'Mensalidade não encontrada' });

    const valor = toMoney(valor_cobrado ?? atual.valor_cobrado);
    const desconto = toMoney(desconto_aplicado ?? atual.desconto_aplicado) ?? 0;
    const venc = isISODate(vencimento || atual.vencimento) ? (vencimento || atual.vencimento) : atual.vencimento;
    const statusNormalizado = status ? String(status).toLowerCase() : atual.status;

    if (!['em_aberto', 'pago', 'cancelado'].includes(statusNormalizado)) {
      return res.status(400).json({ error: 'status inválido' });
    }

    const plano = await runGet('SELECT * FROM plano WHERE id = ?', [atual.plano_id]);
    const inicioCiclo = startOfCycle(venc);
    const dataFim = addDays(inicioCiclo, Math.max(0, Number(plano?.duracao_em_dias || 30) - 1));

    await runExecute(
      `UPDATE mensalidade
       SET valor_cobrado = ?, desconto_aplicado = ?, data_inicio = ?, data_fim = ?, vencimento = ?, observacoes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [valor, desconto, inicioCiclo, dataFim, venc, observacoes, statusNormalizado, id]
    );

    await sincronizarFinanceiro();
    const atualizada = await runGet('SELECT * FROM mensalidade WHERE id = ?', [id]);
    res.json(atualizada);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    await runExecute('DELETE FROM pagamento WHERE mensalidade_id = ?', [id]);
    const result = await runExecute('DELETE FROM mensalidade WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Mensalidade não encontrada para deletar' });

    await sincronizarFinanceiro();
    res.json({ message: 'Mensalidade deletada com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/vigentes', async (_req, res) => {
  try {
    const rows = await runQuery(`
      SELECT * FROM mensalidade
      WHERE status = 'pago'
        AND vencimento IS NOT NULL
        AND vencimento != '0000-00-00'
        AND DATE(data_inicio) <= DATE('now')
        AND DATE(data_fim) >= DATE('now')
      ORDER BY DATE(vencimento) DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
