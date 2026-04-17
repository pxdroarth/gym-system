const pool = require('./database');

async function gerarMensalidades() {
  console.log('Iniciando geração automática de mensalidades');

  try {
    // Buscar alunos ativos
    const [alunos] = await pool.query("SELECT id, plano_id FROM aluno WHERE status = 'ativo'");

    // Data do primeiro dia do mês atual em formato ISO YYYY-MM-DD
    const hoje = new Date();
    const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);

    for (const aluno of alunos) {
      // Verifica se mensalidade para este aluno e mês já existe
      const [existentes] = await pool.query(
        'SELECT * FROM mensalidade WHERE aluno_id = ? AND vencimento = ?',
        [aluno.id, mesAtual]
      );

      if (existentes.length === 0) {
        // Buscar valor base do plano do aluno
        const [planos] = await pool.query('SELECT valor_base FROM plano WHERE id = ?', [aluno.plano_id]);
        if (planos.length === 0) continue; // plano não encontrado, pula

        const valorBase = planos[0].valor_base;

        // Inserir nova mensalidade com status 'em_aberto'
        await pool.query(
          'INSERT INTO mensalidade (aluno_id, vencimento, valor_cobrado, desconto_aplicado, status) VALUES (?, ?, ?, ?, ?)',
          [aluno.id, mesAtual, valorBase, 0, 'em_aberto']
        );

        console.log(`Mensalidade criada para aluno ${aluno.id} para o mês ${mesAtual}`);
      }
    }
  } catch (error) {
    console.error('Erro ao gerar mensalidades:', error);
  }
}

// Permite rodar manualmente com node gerarMensalidades.js
if (require.main === module) {
  gerarMensalidades().then(() => process.exit(0));
}

module.exports = gerarMensalidades;
