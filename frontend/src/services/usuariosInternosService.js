import { api } from "./Api";

// tenantId so e considerado pelo backend para platform_admin.
function tenantParams(tenantId) {
  return tenantId ? { params: { tenant_id: tenantId } } : undefined;
}

export async function listarUsuariosInternos(tenantId) {
  const { data } = await api.get('/usuarios-internos', tenantParams(tenantId));
  return data;
}

export async function obterOpcoesUsuariosInternos(tenantId) {
  const { data } = await api.get('/usuarios-internos/opcoes', tenantParams(tenantId));
  return data;
}

export async function criarUsuarioInterno(payload) {
  const { data } = await api.post('/usuarios-internos', payload);
  return data;
}

export async function alterarPapelUsuarioInterno(id, papel, tenantId) {
  const { data } = await api.patch(`/usuarios-internos/${id}/papel`, { papel, ...(tenantId ? { tenant_id: tenantId } : {}) });
  return data;
}

export async function alterarStatusUsuarioInterno(id, status, tenantId) {
  const { data } = await api.patch(`/usuarios-internos/${id}/status`, { status, ...(tenantId ? { tenant_id: tenantId } : {}) });
  return data;
}

export async function alterarUnidadesUsuarioInterno(id, { unitIds, unitPadraoId, tenantId }) {
  const { data } = await api.patch(`/usuarios-internos/${id}/unidades`, {
    unit_ids: unitIds,
    ...(unitPadraoId ? { unit_padrao_id: unitPadraoId } : {}),
    ...(tenantId ? { tenant_id: tenantId } : {}),
  });
  return data;
}
