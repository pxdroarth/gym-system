// Seed sintetico de DESENVOLVIMENTO (GS-01).
//
// Uso (na raiz do projeto, com a base local nova ou sem alunos):
//   npm run db:seed:dev
//
// - Recusa NODE_ENV=production e recusa base que ja tenha alunos.
// - Executa ensureSchema antes, entao funciona em base inexistente.
// - Grava tudo em uma unica transacao: ou semeia tudo, ou nada.
// - Dados ficticios e deterministicos. As datas sao relativas ao dia da
//   execucao, para que as regras de acesso deem sempre o mesmo resultado.
// - Senha dos usuarios: SEED_DEV_PASSWORD (padrao local: dev12345).

const { runGet, runTransaction } = require('../dbHelper');
const db = require('../database');
const ensureSchema = require('../database/ensureSchema');
const seedPlanoContas = require('../seeds/seedPlanoContas');
const FinanceiroService = require('../services/FinanceiroService');
const { hashPassword } = require('../utils/passwordHash');
const { USER_ROLES, USER_STATUS } = require('../constants/userRoles');
const { DEFAULT_TENANT, DEFAULT_UNIT } = require('../constants/scope');
const { MENSALIDADE_STATUS } = require('../constants/domainStates');

const SEED_TAG = 'seed_dev';
const DEFAULT_PASSWORD = 'dev12345';

function isoDate(offsetDays = 0) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoDateTime(offsetDays, time) {
  return `${isoDate(offsetDays)} ${time}`;
}

const UNITS = {
  matriz: { codigo: DEFAULT_UNIT.codigo },
  filial: { codigo: 'filial', nome: 'Unidade Filial (dev)' },
};

// Um usuario por papel de academia. O platform_admin "admin" vem do bootstrap.
const USERS = [
  { login: 'owner', nome: 'Dona da Rede (dev)', papel: USER_ROLES.OWNER, units: ['matriz', 'filial'] },
  { login: 'admin.academia', nome: 'Admin da Academia (dev)', papel: USER_ROLES.ADMIN, units: ['matriz'] },
  { login: 'gestor', nome: 'Gestor (dev)', papel: USER_ROLES.GESTOR, units: ['matriz'] },
  { login: 'financeiro', nome: 'Financeiro (dev)', papel: USER_ROLES.FINANCEIRO, units: ['matriz'] },
  { login: 'recepcao', nome: 'Recepcao Matriz (dev)', papel: USER_ROLES.RECEPCAO, units: ['matriz'] },
  { login: 'recepcao.filial', nome: 'Recepcao Filial (dev)', papel: USER_ROLES.RECEPCAO, units: ['filial'] },
  { login: 'operador', nome: 'Operador de Acesso (dev)', papel: USER_ROLES.OPERADOR_ACESSO, units: ['matriz'] },
  { login: 'inativo', nome: 'Usuario Inativo (dev)', papel: USER_ROLES.RECEPCAO, units: ['matriz'], status: USER_STATUS.INATIVO },
];

const PLANOS = [
  { key: 'basico', nome: 'Plano Basico', valor_base: 80, descricao: 'Plano mensal basico', duracao_em_dias: 30, compartilhado: 0, quantidade_max_pessoas: 1 },
  { key: 'dupla', nome: 'Plano Dupla', valor_base: 160, descricao: 'Plano mensal para duas pessoas', duracao_em_dias: 30, compartilhado: 1, quantidade_max_pessoas: 2 },
  { key: 'trimestral', nome: 'Plano Trimestral', valor_base: 220, descricao: 'Plano de 90 dias', duracao_em_dias: 90, compartilhado: 0, quantidade_max_pessoas: 1 },
];

// cenario: em_dia | inadimplente | parcial | inativo | dependente
const ALUNOS = [
  { unit: 'matriz', matricula: 1, nome: 'Ana Em Dia', plano: 'basico', cenario: 'em_dia', nascimento: '1995-03-10' },
  { unit: 'matriz', matricula: 2, nome: 'Bruno Inadimplente', plano: 'basico', cenario: 'inadimplente', nascimento: '1990-07-22' },
  { unit: 'matriz', matricula: 3, nome: 'Carla Inativa', plano: 'basico', cenario: 'inativo', nascimento: '1988-11-05' },
  { unit: 'matriz', matricula: 4, nome: 'Diego Titular Dupla', plano: 'dupla', cenario: 'em_dia', nascimento: '1992-01-30' },
  { unit: 'matriz', matricula: 5, nome: 'Elisa Dependente Dupla', plano: 'dupla', cenario: 'dependente', responsavel: 4, nascimento: '1994-09-14' },
  { unit: 'matriz', matricula: 6, nome: 'Fabio Pagamento Parcial', plano: 'basico', cenario: 'parcial', nascimento: '1999-05-02' },
  { unit: 'matriz', matricula: 7, nome: 'Gisele Trimestral', plano: 'trimestral', cenario: 'em_dia', nascimento: '1985-12-19' },
  // Mesmas matriculas da Matriz: comprova unicidade por unidade (GS-01).
  { unit: 'filial', matricula: 1, nome: 'Hugo Filial Em Dia', plano: 'basico', cenario: 'em_dia', nascimento: '1997-04-08' },
  { unit: 'filial', matricula: 2, nome: 'Iris Filial Inadimplente', plano: 'basico', cenario: 'inadimplente', nascimento: '2000-08-25' },
];

const PRODUTOS = [
  { nome: 'Agua Mineral 500ml', descricao: 'Agua sem gas', preco: 3.5, estoque: 60 },
  { nome: 'Isotonico 500ml', descricao: 'Bebida isotonica', preco: 8.5, estoque: 40 },
  { nome: 'Energetico 473ml', descricao: 'Lata', preco: 10, estoque: 24 },
  { nome: 'Barra de Proteina', descricao: 'Barra 45g', preco: 7, estoque: 30 },
];

// [indice do produto, quantidade, dias atras]
const VENDAS = [[0, 2, 1], [1, 1, 2], [2, 1, 3], [3, 2, 5], [0, 3, 8], [1, 2, 12]];

// [nome do plano_contas, valor, dias atras, status]
const DESPESAS = [
  ['Aluguel', 2500, 20, 'pago'],
  ['Energia', 640.35, 15, 'pago'],
  ['Água', 180.9, 15, 'pago'],
  ['Limpeza', 95.4, 6, 'pendente'],
  ['Manutenção', 320, 3, 'pendente'],
];

// Ciclos de 30 dias. offset 0 = ciclo atual; -1, -2 = ciclos anteriores pagos.
function mensalidadesDoCenario(cenario, valor, duracao) {
  const ciclo = (inicioOffset, status, pago) => ({
    data_inicio: isoDate(inicioOffset),
    data_fim: isoDate(inicioOffset + duracao - 1),
    vencimento: isoDate(inicioOffset + duracao - 1),
    status,
    valor_pago: pago,
  });

  if (cenario === 'dependente') return [];
  if (cenario === 'inativo') return [ciclo(-120, MENSALIDADE_STATUS.PAGO, valor)];
  if (cenario === 'inadimplente') {
    return [
      ciclo(-95, MENSALIDADE_STATUS.PAGO, valor),
      ciclo(-65, MENSALIDADE_STATUS.PAGO, valor),
      // Ciclo aberto, vencido ha 5 dias.
      { data_inicio: isoDate(-35), data_fim: isoDate(-6), vencimento: isoDate(-5), status: MENSALIDADE_STATUS.EM_ABERTO, valor_pago: null },
    ];
  }
  if (cenario === 'parcial') {
    return [
      ciclo(-40, MENSALIDADE_STATUS.PAGO, valor),
      ciclo(-10, MENSALIDADE_STATUS.PARCIAL, Math.round(valor / 2 * 100) / 100),
    ];
  }
  // em_dia
  if (duracao > 30) return [ciclo(-20, MENSALIDADE_STATUS.PAGO, valor)];
  return [
    ciclo(-70, MENSALIDADE_STATUS.PAGO, valor),
    ciclo(-40, MENSALIDADE_STATUS.PAGO, valor),
    ciclo(-10, MENSALIDADE_STATUS.PAGO, valor),
  ];
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seedDev recusado: NODE_ENV=production.');
  }

  // Checa antes do ensureSchema: em base ja populada o seed nao deve disparar
  // nenhum bootstrap nem gravar nada.
  const tabelaAluno = await runGet("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aluno'");
  const existentes = tabelaAluno ? await runGet('SELECT COUNT(*) AS total FROM aluno') : { total: 0 };
  if (Number(existentes?.total || 0) > 0) {
    throw new Error(`seedDev recusado: a base ja possui ${existentes.total} aluno(s). Use uma base nova (veja docs/setup/ambiente-local.md).`);
  }

  await ensureSchema();
  await seedPlanoContas();

  const senha = process.env.SEED_DEV_PASSWORD || DEFAULT_PASSWORD;
  const senhaHashes = [];
  for (let i = 0; i < USERS.length; i += 1) senhaHashes.push(await hashPassword(senha));

  const resumo = await runTransaction(async (tx) => {
    const tenant = await tx.get('SELECT id FROM tenant WHERE documento = ? LIMIT 1', [DEFAULT_TENANT.documento]);
    if (!tenant) throw new Error('Tenant bootstrap nao encontrado apos ensureSchema.');
    const tenantId = tenant.id;

    const unitIds = {};
    const matriz = await tx.get('SELECT id FROM unit WHERE tenant_id = ? AND codigo = ? LIMIT 1', [tenantId, UNITS.matriz.codigo]);
    unitIds.matriz = matriz.id;
    const filialExistente = await tx.get('SELECT id FROM unit WHERE tenant_id = ? AND codigo = ? LIMIT 1', [tenantId, UNITS.filial.codigo]);
    unitIds.filial = filialExistente?.id || (await tx.run(
      `INSERT INTO unit (tenant_id, nome, codigo, status, is_matriz, created_at, updated_at)
       VALUES (?, ?, ?, 'ativa', 0, datetime('now'), datetime('now'))`,
      [tenantId, UNITS.filial.nome, UNITS.filial.codigo]
    )).lastID;

    await tx.run('UPDATE plano_contas SET tenant_id = ? WHERE tenant_id IS NULL', [tenantId]);

    for (let i = 0; i < USERS.length; i += 1) {
      const user = USERS[i];
      const { lastID: userId } = await tx.run(
        `INSERT INTO usuario_interno
          (nome, email, login, papel, status, senha_hash, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [user.nome, `${user.login}@dev.local`, user.login, user.papel, user.status || USER_STATUS.ATIVO, senhaHashes[i], SEED_TAG, SEED_TAG]
      );
      await tx.run(
        `INSERT INTO usuario_tenant (usuario_id, tenant_id, papel_no_tenant, status, origem, created_at)
         VALUES (?, ?, ?, 'ativo', 'seed_dev', datetime('now'))`,
        [userId, tenantId, user.papel]
      );
      for (let u = 0; u < user.units.length; u += 1) {
        await tx.run(
          `INSERT INTO usuario_unit (usuario_id, unit_id, is_default, status, origem, created_by, created_at)
           VALUES (?, ?, ?, 'ativo', 'seed_dev', 'seed_dev', datetime('now'))`,
          [userId, unitIds[user.units[u]], u === 0 ? 1 : 0]
        );
      }
    }

    const planos = {};
    for (const plano of PLANOS) {
      const { lastID } = await tx.run(
        `INSERT INTO plano (nome, valor_base, descricao, duracao_em_dias, compartilhado, quantidade_max_pessoas, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [plano.nome, plano.valor_base, plano.descricao, plano.duracao_em_dias, plano.compartilhado, plano.quantidade_max_pessoas, tenantId]
      );
      planos[plano.key] = { ...plano, id: lastID };
    }

    const alunoIds = {};
    for (const aluno of ALUNOS) {
      const plano = planos[aluno.plano];
      const unitId = unitIds[aluno.unit];
      const dia = Number(isoDate(-10).slice(8, 10));
      const { lastID: alunoId } = await tx.run(
        `INSERT INTO aluno (matricula, nome, status, dia_vencimento, plano_id, telefone, data_nascimento, tenant_id, unit_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          aluno.matricula, aluno.nome, aluno.cenario === 'inativo' ? 'inativo' : 'ativo', dia, plano.id,
          `(00) 90000-${String(aluno.matricula).padStart(2, '0')}${aluno.unit === 'filial' ? '99' : '00'}`,
          aluno.nascimento, tenantId, unitId,
        ]
      );
      alunoIds[`${aluno.unit}:${aluno.matricula}`] = alunoId;

      if (aluno.responsavel) {
        await tx.run(
          `INSERT INTO plano_associado (aluno_id, responsavel_id, status, tenant_id, unit_id, created_at, updated_at)
           VALUES (?, ?, 'ativo', ?, ?, datetime('now'), datetime('now'))`,
          [alunoId, alunoIds[`${aluno.unit}:${aluno.responsavel}`], tenantId, unitId]
        );
      }

      for (const m of mensalidadesDoCenario(aluno.cenario, plano.valor_base, plano.duracao_em_dias)) {
        const { lastID: mensalidadeId } = await tx.run(
          `INSERT INTO mensalidade
            (aluno_id, plano_id, valor_cobrado, desconto_aplicado, status, data_inicio, data_fim, vencimento, observacoes, updated_at, tenant_id, unit_id)
           VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [alunoId, plano.id, plano.valor_base, m.status, m.data_inicio, m.data_fim, m.vencimento, SEED_TAG, `${m.data_inicio} 09:00:00`, tenantId, unitId]
        );
        if (m.valor_pago !== null) {
          await tx.run(
            `INSERT INTO pagamento (mensalidade_id, data_pagamento, valor_pago, valor_previsto, tenant_id, unit_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [mensalidadeId, m.data_inicio, m.valor_pago, plano.valor_base, tenantId, unitId]
          );
        }
      }
    }

    for (const unitKey of ['matriz', 'filial']) {
      const unitId = unitIds[unitKey];
      const produtoIds = [];
      for (const produto of PRODUTOS) {
        const vendido = VENDAS
          .filter(([idx]) => PRODUTOS[idx] === produto)
          .reduce((total, [, qtd]) => total + qtd, 0);
        const { lastID } = await tx.run(
          `INSERT INTO produto (nome, descricao, preco, estoque, imagem, tenant_id, unit_id)
           VALUES (?, ?, ?, ?, NULL, ?, ?)`,
          [produto.nome, produto.descricao, produto.preco, produto.estoque - vendido, tenantId, unitId]
        );
        produtoIds.push(lastID);
      }

      for (const [idx, quantidade, diasAtras] of VENDAS) {
        const produto = PRODUTOS[idx];
        await tx.run(
          `INSERT INTO venda_produto (produto_id, produto_nome, quantidade, preco_unitario, valor_total, data_venda, tenant_id, unit_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [produtoIds[idx], produto.nome, quantidade, produto.preco, Math.round(produto.preco * quantidade * 100) / 100, isoDateTime(-diasAtras, '18:30:00'), tenantId, unitId]
        );
      }

      for (const [nomeConta, valor, diasAtras, status] of DESPESAS) {
        const conta = await tx.get('SELECT id FROM plano_contas WHERE nome = ? LIMIT 1', [nomeConta]);
        await tx.run(
          `INSERT INTO conta_financeira
            (descricao, tipo, valor, data_lancamento, status, plano_contas_id, observacao, origem, tenant_id, unit_id, created_at, updated_at)
           VALUES (?, 'despesa', ?, ?, ?, ?, ?, 'conta_financeira', ?, ?, datetime('now'), datetime('now'))`,
          [`${nomeConta} (dev)`, valor, isoDate(-diasAtras), status, conta?.id || null, SEED_TAG, tenantId, unitId]
        );
      }

      // Receitas de mensalidades e vendas pelo mesmo caminho do sistema
      // (/dashboard/financeiro/sincronizar).
      await FinanceiroService.sincronizarFinanceiro({ tenant_id: tenantId, unit_id: unitId }, tx);
    }

    // Historico de acessos ja decididos (o registro novo passa pelo AccessService).
    const historico = [
      ['matriz:1', 1, 'permitido', null],
      ['matriz:1', 2, 'permitido', null],
      ['matriz:4', 1, 'permitido', null],
      ['matriz:2', 1, 'negado', 'mensalidade_vencida'],
      ['filial:1', 1, 'permitido', null],
    ];
    for (const [ref, diasAtras, resultado, motivo] of historico) {
      const [unitKey] = ref.split(':');
      await tx.run(
        `INSERT INTO acesso (aluno_id, data_hora, resultado, motivo_bloqueio, tenant_id, unit_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [alunoIds[ref], isoDateTime(-diasAtras, '07:15:00'), resultado, motivo, tenantId, unitIds[unitKey]]
      );
    }

    const contar = async (tabela) => (await tx.get(`SELECT COUNT(*) AS total FROM ${tabela}`)).total;
    const tabelas = ['unit', 'usuario_interno', 'plano', 'aluno', 'plano_associado', 'mensalidade', 'pagamento', 'acesso', 'produto', 'venda_produto', 'conta_financeira'];
    const contagens = {};
    for (const tabela of tabelas) contagens[tabela] = await contar(tabela);
    return { tenantId, unitIds, contagens };
  });

  console.log('[seedDev] Base de desenvolvimento semeada.');
  console.log(`[seedDev] Tenant ${resumo.tenantId}; unidades: matriz=${resumo.unitIds.matriz}, filial=${resumo.unitIds.filial}`);
  console.table(resumo.contagens);
  console.log(`[seedDev] Usuarios: ${USERS.map((u) => u.login).join(', ')} (senha: ${process.env.SEED_DEV_PASSWORD ? 'SEED_DEV_PASSWORD' : DEFAULT_PASSWORD}).`);
}

main()
  .then(() => db.close())
  .catch((error) => {
    console.error(`[seedDev] ${error.message}`);
    db.close(() => process.exit(1));
  });
