// backend/routes/helpers/periodoHelper.js

function obterIntervaloPorPeriodo(periodo, data_inicio, data_fim) {
  const hoje = new Date();
  let dataInicio, dataFim;

  switch (periodo) {
    case 'diario':
      dataInicio = dataFim = hoje;
      break;
    case 'semanal': {
      const diaSemana = hoje.getDay();
      dataInicio = new Date(hoje);
      dataInicio.setDate(hoje.getDate() - diaSemana);
      dataFim = new Date(hoje);
      dataFim.setDate(dataInicio.getDate() + 6);
      break;
    }
    case 'mensal':
    case 'mes_atual':
    default:
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      break;
    case 'trimestre':
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1);
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      break;
    case 'semestre':
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);
      dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      break;
    case 'anual':
      dataInicio = new Date(hoje.getFullYear(), 0, 1);
      dataFim = new Date(hoje.getFullYear(), 11, 31);
      break;
    case 'intervalo_datas':
      // Recebe do frontend (YYYY-MM-DD)
      dataInicio = new Date(data_inicio);
      dataFim = new Date(data_fim);
      break;
  }

  // Converte para yyyy-MM-dd
  const format = (date) => date.toISOString().split('T')[0];

  return {
    dataInicio: format(dataInicio),
    dataFim: format(dataFim)
  };
}

module.exports = { obterIntervaloPorPeriodo };
