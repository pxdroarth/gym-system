const express = require('express');
const router = express.Router();
const db = require('../dbHelper');
const { sincronizarFinanceiro } = require('../services/FinanceService');
const { calcularKpisFinanceiros } = require('../services/FinanceiroKpiService');
const { requireScope } = require('../helpers/scope');

router.get('/', async (req, res) => {
  try {
    const scope = requireScope(req);
    const contas = await db.runQuery(
      `SELECT * FROM conta_financeira
       WHERE origem = 'conta_financeira' AND tenant_id = ? AND unit_id = ?
       ORDER BY data_lancamento DESC`,
      [scope.tenant_id, scope.unit_id]
    );
    res.json(contas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/kpis', async (req, res) => {
  try {
    const scope = requireScope(req);
    const data = await calcularKpisFinanceiros(req.query || {}, scope);
    res.json(data);
  } catch (error) {
    console.error('Erro em /dashboard/financeiro/kpis:', error);
    res.status(500).json({ erro: 'Erro ao gerar KPIs do financeiro' });
  }
});

router.post('/sincronizar', async (_req, res) => {
  try {
    await sincronizarFinanceiro();
    res.json({ ok: true, message: 'Sincronizacao executada com sucesso!' });
  } catch (e) {
    console.error('Erro ao sincronizar financeiro:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
