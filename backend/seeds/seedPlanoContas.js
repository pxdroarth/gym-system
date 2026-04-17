const { runGet, runExecute } = require('../dbHelper');

async function seedPlanoContas() {
  try {
    const count = await runGet('SELECT COUNT(*) as total FROM plano_contas');
    if (count.total > 0) return; // já tem dados, não faz nada

    const contasFixas = [
      ['Aluguel', 'despesa', 'Pagamento mensal do aluguel do imóvel', 1, 5],
      ['Água', 'despesa', 'Conta de água da academia', 1, 10],
      ['Energia', 'despesa', 'Conta de luz / energia elétrica', 1, 10],
      ['Funcionários', 'despesa', 'Folha de pagamento dos colaboradores', 1, 5],
      ['Manutenção', 'despesa', 'Serviços gerais de manutenção de maquinário', 1, 20],
      ['Limpeza', 'despesa', 'Produtos de limpeza (sabão, desinfetantes etc.)', 1, 12],
      ['Peças - Óleo', 'despesa', 'Lubrificantes para esteiras, bicicletas etc.', 1, 15],
      ['Peças - Cabos', 'despesa', 'Cabos de aço para equipamentos de musculação', 1, 18],
      ['Peças - Polias', 'despesa', 'Troca de polias, rolamentos e acessórios de máquinas', 1, 18]
    ];

    for (const [nome, tipo, descricao, quantidade, dia] of contasFixas) {
      await runExecute(
        `INSERT INTO plano_contas (nome, tipo, descricao, quantidade_sugerida, dia_sugerido)
         VALUES (?, ?, ?, ?, ?)`,
        [nome, tipo, descricao, quantidade, dia]
      );
    }

    console.log('[✔] Plano de contas pré-populado com sucesso.');
  } catch (err) {
    console.error('[❌] Erro ao popular plano de contas:', err.message);
  }
}

module.exports = seedPlanoContas;
