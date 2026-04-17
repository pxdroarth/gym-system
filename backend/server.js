const express = require('express');
const cors = require('cors');
const app = express();
const port = 3001;

// =========================
// 🔧 MIDDLEWARES GLOBAIS
// =========================
app.use(cors({
  origin: [
    'http://localhost:3000', // React padrão
    'http://localhost:5173'  // Vite (se estiver usando)
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json());

// =========================
// 📌 SEEDS (dados iniciais)
// =========================
const seedPlanoContas = require('./seeds/seedPlanoContas');
seedPlanoContas();

// =========================
// 📌 ROTAS PRINCIPAIS (CORE)
// =========================
app.use('/alunos', require('./routes/alunos'));
app.use('/planos', require('./routes/planos'));
app.use('/planoAssociado', require('./routes/planoAssociado')); // ✅ padronizado
app.use('/mensalidades', require('./routes/mensalidades'));
app.use('/pagamentos', require('./routes/pagamentos'));
app.use('/acessos', require('./routes/acessos'));

// =========================
// 📌 PRODUTOS (SaaS local)
// =========================
app.use('/produtos', require('./routes/produtos'));
app.use('/vendasProdutos', require('./routes/vendasProdutos'));

// =========================
// 📌 FINANCEIRO
// =========================
app.use('/financeiro', require('./routes/financeiro'));
app.use('/dashboard/financeiro', require('./routes/dashboardFinanceiro'));
app.use('/financeiro/ativos', require('./routes/ativos'));
app.use('/financeiro/orcamento', require('./routes/orcamento'));
app.use('/planoContas', require('./routes/planoContas'));
app.use('/contasFinanceiras', require('./routes/contasFinanceiras'));
app.use('/relatorios', require('./routes/relatorios'));

// =========================
// 🩺 HEALTHCHECK
// =========================
const db = require('./database');

app.get('/test-db', (req, res) => {
  db.get('SELECT datetime("now") AS agora', [], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ db_time: row.agora });
  });
});

// =========================
// 🚀 INICIALIZAÇÃO
// =========================
app.listen(port, () => {
  console.log(`🚀 API rodando em http://localhost:${port}`);
  console.log(`📊 Dashboard: http://localhost:${port}/dashboard/financeiro/kpis`);
  console.log(`🔄 Sync:      http://localhost:${port}/dashboard/financeiro/sincronizar`);
});