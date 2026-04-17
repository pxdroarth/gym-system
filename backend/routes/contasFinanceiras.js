const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute } = require('../dbHelper');

// Validação de campos obrigatórios
function validarCamposObrigatorios(body, campos) {
  for (const campo of campos) {
    if (!body[campo]) return `Campo obrigatório ausente: ${campo}`;
  }
  return null;
}

// GET /contas-financeiras?tipo=&status=&data_inicial=&data_final=&descricao=&page=&perPage=
router.get('/', async (req, res) => {
  const { tipo, status, data_inicial, data_final, descricao = "", page = 1, perPage = 10 } = req.query;
  const params = [];
  // FILTRA SÓ contas administrativas:
  let where = "WHERE cf.origem = 'conta_financeira'";

  // Filtros
  if (tipo && tipo !== 'todos') {
    where += ' AND cf.tipo = ?';
    params.push(tipo);
  }
  if (status && status !== 'todos') {
    where += ' AND cf.status = ?';
    params.push(status);
  }
  if (data_inicial) {
    where += ' AND date(cf.data_lancamento) >= date(?)';
    params.push(data_inicial);
  }
  if (data_final) {
    where += ' AND date(cf.data_lancamento) <= date(?)';
    params.push(data_final);
  }
  if (descricao && descricao.trim() !== "") {
    where += " AND LOWER(cf.descricao) LIKE ?";
    params.push(`%${descricao.toLowerCase()}%`);
  }

  // Paginação
  const limit = parseInt(perPage) || 10;
  const offset = ((parseInt(page) || 1) - 1) * limit;

  // Query de dados
  let sql = `
    SELECT cf.*, pc.nome AS plano_nome
    FROM conta_financeira cf
    LEFT JOIN plano_contas pc ON cf.plano_contas_id = pc.id
    ${where}
    ORDER BY cf.data_lancamento DESC, cf.id DESC
    LIMIT ? OFFSET ?
  `;
  // Query de contagem total
  let sqlCount = `
    SELECT COUNT(*) AS total
    FROM conta_financeira cf
    LEFT JOIN plano_contas pc ON cf.plano_contas_id = pc.id
    ${where}
  `;

  try {
    const rows = await runQuery(sql, [...params, limit, offset]);
    const countRow = await runGet(sqlCount, params);
    res.json({
      data: rows,
      total: countRow ? countRow.total : 0,
      page: parseInt(page),
      perPage: limit
    });
  } catch (e) {
    console.error('[ERRO GET contas-financeiras]', e);
    res.status(500).json({ error: 'Erro ao buscar contas financeiras' });
  }
});

// POST /contas-financeiras
router.post('/', async (req, res) => {
  const { descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao } = req.body;
  const erro = validarCamposObrigatorios(req.body, ['descricao', 'tipo', 'valor', 'data_lancamento', 'status']);
  if (erro) return res.status(400).json({ error: erro });

  try {
    // Define a origem automaticamente como 'conta_financeira'
    const result = await runExecute(`
      INSERT INTO conta_financeira 
      (descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao, origem, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'conta_financeira', datetime('now'), datetime('now'))
    `, [descricao, tipo, valor, data_lancamento, status, plano_contas_id || null, observacao || null]);
    res.status(201).json({ id: result.id });
  } catch (e) {
    console.error('[ERRO POST contas-financeiras]', e);
    res.status(500).json({ error: 'Erro ao criar conta financeira' });
  }
});

// PUT /contas-financeiras/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao } = req.body;

  try {
    const result = await runExecute(`
      UPDATE conta_financeira SET
        descricao = ?, tipo = ?, valor = ?, data_lancamento = ?, status = ?, 
        plano_contas_id = ?, observacao = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [descricao, tipo, valor, data_lancamento, status, plano_contas_id || null, observacao || null, id]);

    if (result.changes === 0) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json({ message: 'Conta financeira atualizada com sucesso' });
  } catch (e) {
    console.error('[ERRO PUT contas-financeiras]', e);
    res.status(500).json({ error: 'Erro ao atualizar conta financeira' });
  }
});

// PATCH /contas-financeiras/:id/status   (confirmar pagamento)
router.patch('/:id/status', async (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status é obrigatório' });

  try {
    const result = await runExecute(`
      UPDATE conta_financeira 
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [status, id]);

    if (result.changes === 0) return res.status(404).json({ error: 'Conta não encontrada' });
    res.json({ message: 'Status da conta atualizado com sucesso' });
  } catch (e) {
    console.error('[ERRO PATCH contas-financeiras status]', e);
    res.status(500).json({ error: 'Erro ao atualizar status da conta' });
  }
});

// DELETE /contas-financeiras/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await runExecute('DELETE FROM conta_financeira WHERE id = ?', [id]);
    if (result.changes === 0) return res.status(404).json({ error: 'Conta não encontrada para excluir' });
    res.json({ message: 'Conta financeira excluída com sucesso' });
  } catch (e) {
    console.error('[ERRO DELETE contas-financeiras]', e);
    res.status(500).json({ error: 'Erro ao excluir conta financeira' });
  }
});

module.exports = router;
