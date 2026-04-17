// src/services/planoContasService.js

const API_BASE_URL = 'http://localhost:3001';
const endpoint = `${API_BASE_URL}/plano-contas`;

// 🔹 Buscar todas as contas do plano
export async function getPlanoContas() {
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error('Erro ao buscar plano de contas');
  return await res.json();
}

// 🔹 Criar nova conta
export async function createPlanoConta(dados) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) throw new Error('Erro ao criar conta');
  return await res.json();
}

// 🔹 Atualizar conta existente
export async function updatePlanoConta(id, dados) {
  const res = await fetch(`${endpoint}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
  if (!res.ok) throw new Error('Erro ao atualizar conta');
  return await res.json();
}

// 🔹 Remover conta
export async function deletePlanoConta(id) {
  const res = await fetch(`${endpoint}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Erro ao excluir conta');
  return await res.json();
}
