import { api } from './Api';

export async function getDashboardKPIs(filtros = {}) {
  const { data } = await api.get('/dashboard/financeiro/kpis', {
    params: filtros,
  });

  return {
    ...data,
    despesas_top5: data.despesas_top5 || [],
    receitas_categoria: data.receitas_categoria || [],
  };
}
