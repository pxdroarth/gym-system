const { runGet, runQuery } = require('../dbHelper');
const AppError = require('../errors/AppError');

function number(value) {
  return Number(value || 0);
}

async function resumoConsolidado(tenantId) {
  const id = Number(tenantId);
  if (!id) throw new AppError('tenant_id nao resolvido', 400, 'TENANT_ID_INVALIDO');

  const tenant = await runGet('SELECT id, nome, documento, status, plano_comercial, onboarding_status FROM tenant WHERE id = ?', [id]);
  if (!tenant) throw new AppError('Tenant nao encontrado', 404, 'TENANT_NAO_ENCONTRADO');

  const unidades = await runQuery(
    `SELECT id, nome, codigo, status, is_matriz
     FROM unit
     WHERE tenant_id = ?
     ORDER BY is_matriz DESC, nome COLLATE NOCASE`,
    [id]
  );

  const financeiro = await runGet(
    `SELECT
       COALESCE(SUM(CASE WHEN tipo = 'receita' AND status = 'pago' THEN valor ELSE 0 END), 0) AS receitas,
       COALESCE(SUM(CASE WHEN tipo = 'despesa' AND status = 'pago' THEN valor ELSE 0 END), 0) AS despesas,
       COALESCE(SUM(CASE WHEN tipo = 'despesa' AND status = 'pendente' THEN valor ELSE 0 END), 0) AS despesas_pendentes
     FROM conta_financeira
     WHERE tenant_id = ?
       AND COALESCE(deleted_at, '') = ''`,
    [id]
  );

  const totais = await runGet(
    `SELECT
       (SELECT COUNT(*) FROM aluno WHERE tenant_id = ? AND COALESCE(status, 'ativo') = 'ativo') AS alunos_ativos,
       (SELECT COUNT(*) FROM produto WHERE tenant_id = ?) AS produtos,
       (SELECT COUNT(*) FROM venda_produto WHERE tenant_id = ? AND COALESCE(deleted_at, '') = '') AS vendas,
       (SELECT COUNT(*) FROM usuario_tenant WHERE tenant_id = ? AND status = 'ativo') AS usuarios_vinculados`,
    [id, id, id, id]
  );

  const porUnidade = await runQuery(
    `SELECT
       u.id,
       u.nome,
       u.codigo,
       u.status,
       u.is_matriz,
       (SELECT COUNT(*) FROM aluno a WHERE a.unit_id = u.id AND a.tenant_id = u.tenant_id AND COALESCE(a.status, 'ativo') = 'ativo') AS alunos_ativos,
       (SELECT COUNT(*) FROM produto p WHERE p.unit_id = u.id AND p.tenant_id = u.tenant_id) AS produtos,
       (SELECT COUNT(*) FROM venda_produto v WHERE v.unit_id = u.id AND v.tenant_id = u.tenant_id AND COALESCE(v.deleted_at, '') = '') AS vendas,
       (
         SELECT COALESCE(SUM(cf.valor), 0)
         FROM conta_financeira cf
         WHERE cf.unit_id = u.id AND cf.tenant_id = u.tenant_id
           AND cf.tipo = 'receita'
           AND cf.status = 'pago'
           AND COALESCE(cf.deleted_at, '') = ''
       ) AS receitas,
       (
         SELECT COALESCE(SUM(cf.valor), 0)
         FROM conta_financeira cf
         WHERE cf.unit_id = u.id AND cf.tenant_id = u.tenant_id
           AND cf.tipo = 'despesa'
           AND cf.status = 'pago'
           AND COALESCE(cf.deleted_at, '') = ''
       ) AS despesas
     FROM unit u
     WHERE u.tenant_id = ?
     ORDER BY u.is_matriz DESC, u.nome COLLATE NOCASE`,
    [id]
  );

  const receitas = number(financeiro?.receitas);
  const despesas = number(financeiro?.despesas);

  return {
    tenant,
    escopo: 'tenant_consolidado_readonly',
    totais: {
      unidades: unidades.length,
      alunos_ativos: number(totais?.alunos_ativos),
      produtos: number(totais?.produtos),
      vendas: number(totais?.vendas),
      usuarios_vinculados: number(totais?.usuarios_vinculados),
      receitas,
      despesas,
      despesas_pendentes: number(financeiro?.despesas_pendentes),
      saldo: receitas - despesas,
    },
    unidades: porUnidade.map((unit) => ({
      ...unit,
      alunos_ativos: number(unit.alunos_ativos),
      produtos: number(unit.produtos),
      vendas: number(unit.vendas),
      receitas: number(unit.receitas),
      despesas: number(unit.despesas),
      saldo: number(unit.receitas) - number(unit.despesas),
    })),
    read_only: true,
  };
}

module.exports = {
  resumoConsolidado,
};
