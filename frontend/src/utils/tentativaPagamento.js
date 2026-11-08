// Tentativa de pagamento com chave de idempotencia (GS-07 P1.1).
//
// Cada tentativa de pagar uma mensalidade recebe uma Idempotency-Key. Se a
// requisicao cair por timeout, falha de rede ou erro 5xx, a tentativa fica
// guardada (sessionStorage, sobrevive a recarregar a pagina) e o proximo
// clique reenvia exatamente o mesmo pedido com a mesma chave: o servidor
// devolve o pagamento original em vez de criar outro. A tentativa so e
// descartada quando o servidor responde de forma definitiva (2xx ou 4xx).

const PREFIXO = "gs.pagamento.tentativa.";

function novaChave() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `pag-${crypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `pag-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function ler(mensalidadeId) {
  try {
    const bruto = sessionStorage.getItem(PREFIXO + mensalidadeId);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

function gravar(mensalidadeId, tentativa) {
  try {
    sessionStorage.setItem(PREFIXO + mensalidadeId, JSON.stringify(tentativa));
  } catch {
    // Sem storage (modo privado restrito): a tentativa vale so nesta tela.
  }
}

export function tentativaPendente(mensalidadeId) {
  return ler(mensalidadeId);
}

// Reaproveita a tentativa pendente do mesmo valor; senao abre uma nova.
export function abrirTentativa(mensalidadeId, payload) {
  const pendente = ler(mensalidadeId);
  if (pendente && Number(pendente.payload?.valor_pago) === Number(payload.valor_pago)) {
    return { ...pendente, reenvio: true };
  }
  const tentativa = { chave: novaChave(), payload, criada_em: new Date().toISOString() };
  gravar(mensalidadeId, tentativa);
  return { ...tentativa, reenvio: false };
}

export function encerrarTentativa(mensalidadeId) {
  try {
    sessionStorage.removeItem(PREFIXO + mensalidadeId);
  } catch {
    // ignorado
  }
}

// Sem resposta definitiva do servidor: o pagamento pode ou nao ter sido
// gravado, entao o reenvio precisa usar a mesma chave.
export function falhaSemConfirmacao(error) {
  if (!error?.response) return true;
  return Number(error.response.status) >= 500;
}
