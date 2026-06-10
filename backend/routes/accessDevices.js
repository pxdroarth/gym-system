const express = require('express');
const { PERMISSIONS } = require('../constants/userRoles');
const { requirePermission } = require('../middlewares/requirePermission');
const { requireScope } = require('../helpers/scope');
const AccessDeviceService = require('../services/AccessDeviceService');

const devicesRouter = express.Router();
const credentialsRouter = express.Router();
const alunoCredentialsRouter = express.Router({ mergeParams: true });

const readAccessCredentialsPermission = requirePermission(
  PERMISSIONS.ACESSO_CREDENCIAIS_VISUALIZAR
);

devicesRouter.use(readAccessCredentialsPermission);
credentialsRouter.use(readAccessCredentialsPermission);
alunoCredentialsRouter.use(readAccessCredentialsPermission);

devicesRouter.get('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await AccessDeviceService.listarDispositivos({
      scope,
      query: req.query,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
});

devicesRouter.get('/:id', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await AccessDeviceService.buscarDispositivoPorId(req.params.id, {
      scope,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
});

credentialsRouter.get('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await AccessDeviceService.listarCredenciais({
      scope,
      query: req.query,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
});

credentialsRouter.get('/:id', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await AccessDeviceService.buscarCredencialPorId(req.params.id, {
      scope,
    });

    res.json(data);
  } catch (error) {
    next(error);
  }
});

alunoCredentialsRouter.get('/', async (req, res, next) => {
  try {
    const scope = requireScope(req);
    const data = await AccessDeviceService.listarCredenciaisPorAluno(
      req.params.alunoId,
      {
        scope,
        query: req.query,
      }
    );

    res.json(data);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  devicesRouter,
  credentialsRouter,
  alunoCredentialsRouter,
};
