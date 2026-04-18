const express = require('express');
const cors = require('cors');
const path = require('path');
const errorHandler = require('./middlewares/errorHandler');
const ensureSchema = require('./database/ensureSchema');

const app = express();
const port = 3001;

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

const db = require('./database');

async function start() {
  await ensureSchema();

  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  app.use('/financeiro/ativos', require('./routes/ativos'));
  app.use('/financeiro/orcamento', require('./routes/orcamento'));
  app.use('/planoContas', require('./routes/planoContas'));
  app.use('/plano-contas', require('./routes/planoContas'));
  app.use('/contasFinanceiras', require('./routes/contasFinanceiras'));
  app.use('/contas-financeiras', require('./routes/contasFinanceiras'));
  app.use('/fechamento-mensal', require('./routes/fechamentoMensal'));
  app.use('/relatorios', require('./routes/relatorios'));

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
