const express = require('express');
const router = express.Router();
const { runQuery, runGet, runExecute, runTransaction } = require('../dbHelper');
const AuditService = require('../services/AuditService');
const FechamentoMensalService = require('../services/FechamentoMensalService');
const VinculoService = require('../services/VinculoService');
const { PERMISSIONS } = require('../constants/userRoles');
const { assertPermission } = require('../middlewares/requirePermission');

function toISODate(d) {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const responsavelIdExpr = 'COALESCE(pa.responsavel_id, a.id)';

const statusMensalidadeExpr = `
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM mensalidade m
      WHERE m.aluno_id = ${responsavelIdExpr}
        AND m.status = 'em_aberto'
        AND m.vencimento IS NOT NULL
        AND m.vencimento != '0000-00-00'
        AND DATE(m.vencimento) <= DATE('now')
    ) THEN 'atrasado'
    WHEN EXISTS (
      SELECT 1
      FROM mensalidade m
      WHERE m.aluno_id = ${responsavelIdExpr}
    ) THEN 'em_dia'
    ELSE 'sem_mensalidade'
  END
`;

const statusOperacionalExpr = `
  CASE
    WHEN COALESCE(a.status, 'ativo') != 'ativo' THEN 'inativo'
    WHEN EXISTS (
      SELECT 1
      FROM aluno ar
      WHERE ar.id = pa.responsavel_id
        AND COALESCE(ar.status, 'ativo') != 'ativo'
    ) THEN 'inativo'
    WHEN EXISTS (
      SELECT 1
      FROM mensalidade m
      WHERE m.aluno_id = ${responsavelIdExpr}
        AND m.status = 'em_aberto'
        AND m.vencimento IS NOT NULL
        AND m.vencimento != '0000-00-00'
        AND DATE(m.vencimento) <= DATE('now')
    ) THEN 'inativo'
    ELSE 'ativo'
  END
`;

const baseSelect = `
  SELECT a.*, pa.responsavel_id,
         CASE WHEN pa.responsavel_id IS NOT NULL THEN 1 ELSE 0 END AS eh_vinculado,
         ${statusMensalidadeExpr} AS mensalidade_status,
         ${statusOperacionalExpr} AS status_ativo,
         COALESCE(p.nome, 'Sem plano') AS plano_nome
  FROM aluno a
  LEFT JOIN plano_associado pa ON pa.aluno_id = a.id AND COALESCE(pa.status, 'ativo') != 'encerrado'
  LEFT JOIN plano p ON a.plano_id = p.id
`;

router.get('/pesquisa', async (req, res) => {
  try {
    const termo = String(req.query.termo || '').trim().toLowerCase();
    const pagina = Math.max(1, parseInt(req.query.pagina || '1'));
    const limite = Math.min(50, Math.max(1, parseInt(req.query.limite || '15')));
    const offset = (pagina - 1) * limite;

    let where = '';
    let params = [];
    if (termo) {
      where = `WHERE LOWER(a.nome) LIKE ? OR CAST(a.matricula AS TEXT) LIKE ?`;
      params = [`%${termo}%`, `%${termo}%`];
    }

    const totalRow = await runGet(`SELECT COUNT(*) AS total FROM aluno a ${where}`, params);
    const lista = await runQuery(
      `${baseSelect} ${where}
       ORDER BY a.nome ASC LIMIT ? OFFSET ?`,
      [...params, limite, offset]
    );

    res.json({ alunos: lista, total: totalRow.total, pagina, limite });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (_req, res) => {
  try {
    const rows = await runQuery(`
      ${baseSelect}
      ORDER BY a.id DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    let { nome, status, dia_vencimento, plano_id, telefone, data_nascimento } = req.body || {};

    if (!nome || !data_nascimento || plano_id === undefined || plano_id === null || plano_id === '' || dia_vencimento === undefined || dia_vencimento === null || dia_vencimento === '') {
      return res.status(400).json({ error: 'Campos obrigatórios faltando (nome, data_nascimento, plano_id, dia_vencimento)' });
    }

    const dv = Number(dia_vencimento);
    if (!dv || dv < 1 || dv > 31) {
      return res.status(400).json({ error: 'dia_vencimento inválido (1..31)' });
    }

    const planoIdFinal = Number(plano_id);
    if (Number.isNaN(planoIdFinal)) {
      return res.status(400).json({ error: 'plano_id inválido' });
    }

    const plano = await runGet('SELECT id FROM plano WHERE id = ?', [planoIdFinal]);
    if (!plano) return res.status(400).json({ error: 'Plano não encontrado' });

    const dataNascISO = toISODate(data_nascimento);
    if (!dataNascISO) {
      return res.status(400).json({ error: 'data_nascimento inválida' });
    }

    const statusFinal = (status || 'ativo') === 'inativo' ? 'inativo' : 'ativo';
    const last = await runGet(`SELECT MAX(matricula) AS ultima FROM aluno`);
    const novaMatricula = (Number(last?.ultima) || 1000) + 1;

    const result = await runExecute(
      `INSERT INTO aluno (matricula, nome, status, dia_vencimento, plano_id, telefone, data_nascimento)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [novaMatricula, String(nome).trim(), statusFinal, dv, planoIdFinal, telefone || null, dataNascISO]
    );

    const criado = await runGet(`SELECT * FROM aluno WHERE id = ?`, [result.lastID]);
    res.status(201).json(criado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/debito', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const row = await runGet(
      `SELECT COUNT(*) AS total
       FROM mensalidade
       WHERE aluno_id = COALESCE((SELECT responsavel_id FROM plano_associado WHERE aluno_id = ? LIMIT 1), ?)
         AND status = 'em_aberto'
         AND vencimento IS NOT NULL
         AND vencimento != '0000-00-00'
         AND DATE(vencimento) <= DATE('now')`,
      [id, id]
    );
    res.json({ em_debito: row.total > 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    let { nome, status, dia_vencimento, plano_id, telefone, data_nascimento } = req.body || {};

    if (!nome || !data_nascimento || plano_id === undefined || plano_id === null || plano_id === '' || dia_vencimento === undefined || dia_vencimento === null || dia_vencimento === '') {
      return res.status(400).json({ error: 'Campos obrigatórios faltando (nome, data_nascimento, plano_id, dia_vencimento)' });
    }

    const dv = Number(dia_vencimento);
    if (!dv || dv < 1 || dv > 31) {
      return res.status(400).json({ error: 'dia_vencimento inválido (1..31)' });
    }

    const planoIdFinal = Number(plano_id);
    if (Number.isNaN(planoIdFinal)) {
      return res.status(400).json({ error: 'plano_id inválido' });
    }

    const plano = await runGet('SELECT id FROM plano WHERE id = ?', [planoIdFinal]);
    if (!plano) return res.status(400).json({ error: 'Plano não encontrado' });

    const dataNascISO = toISODate(data_nascimento);
    if (!dataNascISO) {
      return res.status(400).json({ error: 'data_nascimento inválida' });
    }

    const statusFinal = (status || 'ativo') === 'inativo' ? 'inativo' : 'ativo';
    const actor = AuditService.getActorFromRequest(req);

    const atualizado = await runTransaction(async (tx) => {
      const antes = await tx.get('SELECT * FROM aluno WHERE id = ?', [id]);
      if (!antes) return null;

      const dependentes = await tx.all(
        `SELECT * FROM plano_associado
         WHERE responsavel_id = ?
           AND COALESCE(status, 'ativo') = 'ativo'`,
        [id]
      );
      const mudouPlanoComDependentes = Number(antes.plano_id) !== planoIdFinal && dependentes.length > 0;

      if (mudouPlanoComDependentes) {
        assertPermission(req, PERMISSIONS.ALUNOS_ALTERAR_PLANO_COM_DEPENDENTES);
        await FechamentoMensalService.assertPeriodoEditavelPorData(
          new Date().toISOString().slice(0, 10),
          'mudanca de plano com dependentes',
          tx
        );
      }

      const result = await tx.run(
        `UPDATE aluno
           SET nome = ?, status = ?, dia_vencimento = ?, plano_id = ?, telefone = ?, data_nascimento = ?
         WHERE id = ?`,
        [String(nome).trim(), statusFinal, dv, planoIdFinal, telefone || null, dataNascISO, id]
      );

      if (result.changes === 0) return null;

      if (mudouPlanoComDependentes) {
        await VinculoService.marcarDependentesPendenteRegularizacao(id, actor, tx);
      }

      const depois = await tx.get('SELECT * FROM aluno WHERE id = ?', [id]);
      await AuditService.logAction({
        actor,
        action: mudouPlanoComDependentes ? 'alterar_aluno_e_regularizar_dependentes' : 'alterar_aluno',
        module: 'alunos',
        recordType: 'aluno',
        recordId: id,
        before: antes,
        after: depois,
        metadata: { mudou_plano_com_dependentes: mudouPlanoComDependentes },
      }, tx);

      return depois;
    });

    if (!atualizado) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json(atualizado);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const row = await runGet(`
      ${baseSelect}
      WHERE a.id = ?
    `, [id]);

    if (!row) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
