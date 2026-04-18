const express = require('express');
const router = express.Router();
const VinculoService = require('../services/VinculoService');
const AuditService = require('../services/AuditService');

router.get('/', async (_req, res, next) => {
  try {
    res.json(await VinculoService.listarTodos());
  } catch (err) {
    next(err);
  }
});

router.get('/responsavel/:responsavelId/detalhe', async (req, res, next) => {
  const responsavelId = parseInt(req.params.responsavelId);
  if (!responsavelId) return res.status(400).json({ error: 'Responsavel invalido' });

  try {
    res.json(await VinculoService.detalheResponsavel(responsavelId));
  } catch (err) {
    next(err);
  }
});

router.get('/:responsavelId', async (req, res, next) => {
  const responsavelId = parseInt(req.params.responsavelId);
  if (!responsavelId) return res.status(400).json({ error: 'Responsavel invalido' });

  try {
    res.json(await VinculoService.listarPorResponsavel(responsavelId));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const vinculo = await VinculoService.criarVinculo(
      req.body || {},
      AuditService.getActorFromRequest(req)
    );
    res.status(201).json(vinculo);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    res.json(await VinculoService.encerrarVinculo(
      req.params.id,
      AuditService.getActorFromRequest(req)
    ));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
