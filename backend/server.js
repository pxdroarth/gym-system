const express = require('express');
const cors = require('cors');
const path = require('path');
const packageJson = require('../package.json');
const AppError = require('./errors/AppError');
const errorHandler = require('./middlewares/errorHandler');
const ensureSchema = require('./database/ensureSchema');
const correlationId = require('./middlewares/correlationId');
const operatorContext = require('./middlewares/operatorContext');
const scopeContext = require('./middlewares/scopeContext');
const securityHeaders = require('./middlewares/securityHeaders');

const app = express();
const port = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

function splitOrigins(value) {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const configuredOrigins = [
    ...splitOrigins(process.env.CORS_ORIGINS),
    ...splitOrigins(process.env.FRONTEND_URL),
  ];

  if (configuredOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS nao deve usar "*" com credenciais.');
  }

  if (configuredOrigins.length) {
    return [...new Set(configuredOrigins)];
  }

  if (isProduction) {
    throw new Error('CORS_ORIGINS ou FRONTEND_URL e obrigatorio em production.');
  }

  return [
    'http://localhost:3000',
    'http://localhost:5173',
  ];
}

const allowedOrigins = getAllowedOrigins();

if (isProduction || process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

app.use(correlationId);
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new AppError('Origem CORS nao autorizada', 403, 'CORS_ORIGIN_NOT_ALLOWED'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Unit-Id', 'X-Correlation-Id'],
  exposedHeaders: ['X-Correlation-Id'],
}));

const db = require('./database');

async function start() {
  await ensureSchema();

  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
  app.use(operatorContext);
  app.use(scopeContext);

  const seedPlanoContas = require('./seeds/seedPlanoContas');
  await seedPlanoContas();

  app.use('/alunos', require('./routes/alunos'));
  app.use('/planos', require('./routes/planos'));
  app.use('/planoAssociado', require('./routes/planoAssociado'));
  app.use('/plano-associado', require('./routes/planoAssociado'));
  app.use('/mensalidades', require('./routes/mensalidades'));
  app.use('/pagamentos', require('./routes/pagamentos'));
  app.use('/acessos', require('./routes/acessos'));

  app.use('/produtos', require('./routes/produtos'));
  app.use('/vendasProdutos', require('./routes/vendasProdutos'));
  app.use('/vendas-produtos', require('./routes/vendasProdutos'));

  app.use('/financeiro', require('./routes/financeiro'));
  app.use('/dashboard/financeiro', require('./routes/dashboardFinanceiro'));
  app.use('/tenant-dashboard', require('./routes/tenantDashboard'));
  app.use('/financeiro/ativos', require('./routes/ativos'));
  app.use('/financeiro/orcamento', require('./routes/orcamento'));
  app.use('/auth', require('./routes/auth'));
  app.use('/onboarding', require('./routes/onboarding'));
  app.use('/tenants', require('./routes/tenants'));
  app.use('/units', require('./routes/units'));
  app.use('/planoContas', require('./routes/planoContas'));
  app.use('/plano-contas', require('./routes/planoContas'));
  app.use('/contasFinanceiras', require('./routes/contasFinanceiras'));
  app.use('/contas-financeiras', require('./routes/contasFinanceiras'));
  app.use('/fechamento-mensal', require('./routes/fechamentoMensal'));
  app.use('/reversoes', require('./routes/reversoes'));
  app.use('/audit-logs', require('./routes/auditLogs'));
  app.use('/usuarios-internos', require('./routes/usuariosInternos'));
  app.use('/relatorios', require('./routes/relatorios'));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: packageJson.name,
      timestamp: new Date().toISOString(),
      uptime_seconds: Number(process.uptime().toFixed(3)),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  app.get('/test-db', (req, res) => {
    db.get('SELECT datetime("now") AS agora', [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ db_time: row.agora });
    });
  });

  app.use(errorHandler);

  app.listen(port, () => {
    console.log(`API rodando em http://localhost:${port}`);
    console.log(`Dashboard: http://localhost:${port}/dashboard/financeiro/kpis`);
    console.log(`Sync:      http://localhost:${port}/dashboard/financeiro/sincronizar`);
  });
}

start().catch((error) => {
  console.error('[ERRO AO INICIAR API]', error);
  process.exit(1);
});
