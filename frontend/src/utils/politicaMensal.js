const nomes = {
  primeira_proporcional: "Primeira cobrança proporcional",
  retorno_proporcional: "Retorno proporcional",
  retorno_integral: "Retorno pelo ciclo integral",
  ciclo_integral: "Ciclo integral",
  renovacao_antecipada: "Renovação antecipada do próximo ciclo",
  transicao_proporcional: "Transição proporcional após a cobertura já paga",
  cobranca_existente: "Cobrança existente",
};

export function nomePoliticaMensal(politica) {
  return nomes[politica];
}
