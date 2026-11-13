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

// Diferenca, em ms, entre o relogio do fuso e o UTC no instante dado.
function deslocamentoDoFuso(instante, timeZone) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);
  const v = (tipo) => Number(partes.find((parte) => parte.type === tipo).value);
  const comoUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

// Converte data e hora de parede no fuso da operacao ('AAAA-MM-DDTHH:MM',
// segundos opcionais) para o instante correspondente. Devolve null se o texto
// nao for uma data de calendario valida (ex.: 2026-02-30, 24:00) ou se o
// horario nao existir no fuso (lacuna de horario de verao).
function instanteDeHorarioLocal(texto, timeZone = fusoDaOperacao()) {
  const m = String(texto || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [ano, mes, dia, hora, minuto, segundo] = m.slice(1).map((x) => Number(x || 0));
  const parede = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  const conferencia = new Date(parede);
  if (conferencia.getUTCFullYear() !== ano || conferencia.getUTCMonth() !== mes - 1 || conferencia.getUTCDate() !== dia
    || conferencia.getUTCHours() !== hora || conferencia.getUTCMinutes() !== minuto || conferencia.getUTCSeconds() !== segundo) {
    return null;
  }
  let instante = new Date(parede - deslocamentoDoFuso(new Date(parede), timeZone));
  instante = new Date(parede - deslocamentoDoFuso(instante, timeZone));
  if (parede - deslocamentoDoFuso(instante, timeZone) !== instante.getTime()) return null;
  return instante;
}

module.exports = {
  FUSO_PADRAO,
  fusoDaOperacao,
  dataLocalISO,
  instanteDeHorarioLocal,
};
