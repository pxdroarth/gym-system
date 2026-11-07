// Valores monetarios em centavos inteiros para comparar saldo sem erro de
// ponto flutuante (ex.: 0.1 + 0.2). Aceita no maximo duas casas decimais.
function paraCentavos(valor) {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = typeof valor === 'string' ? Number(valor.replace(',', '.')) : Number(valor);
  if (!Number.isFinite(n)) return null;
  const centavos = Math.round(n * 100);
  if (Math.abs(n * 100 - centavos) > 1e-6) return null;
  return centavos;
}

function deCentavos(centavos) {
  return Math.round(Number(centavos || 0)) / 100;
}

module.exports = { paraCentavos, deCentavos };
