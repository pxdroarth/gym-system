// Data local da operacao (GS-07 F0 / P9).
// new Date().toISOString() devolve a data em UTC: depois das 21h em Brasilia
// ja seria "amanha". Regras de dia (vencimento, cobertura) usam esta data local.
const FUSO_PADRAO = 'America/Sao_Paulo';
let avisoFusoInvalido = false;

function fusoDaOperacao() {
  const configurado = String(process.env.APP_TIMEZONE || '').trim();
  if (!configurado) return FUSO_PADRAO;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: configurado });
    return configurado;
  } catch (_error) {
    if (!avisoFusoInvalido) {
      console.warn(`[dataLocal] APP_TIMEZONE invalido (${configurado}); usando ${FUSO_PADRAO}.`);
      avisoFusoInvalido = true;
    }
    return FUSO_PADRAO;
  }
}

// AAAA-MM-DD no fuso da operacao. `referencia` aceita Date, ISO ou timestamp.
function dataLocalISO(referencia = new Date(), timeZone = fusoDaOperacao()) {
  const data = referencia instanceof Date ? referencia : new Date(referencia);
  if (Number.isNaN(data.getTime())) throw new Error('Data de referencia invalida');
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(data);
  const valor = (tipo) => partes.find((parte) => parte.type === tipo).value;
  return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

module.exports = {
  FUSO_PADRAO,
  fusoDaOperacao,
  dataLocalISO,
};
