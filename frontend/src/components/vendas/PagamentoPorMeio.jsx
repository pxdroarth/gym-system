import React from "react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Select from "../ui/Select";

// Pagamento e devolucao por meio (L04, decisao de 16/11/2026). Os valores sao
// conferidos em centavos aqui e no servidor; o servidor decide.

export const MEIOS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
];
const ROTULO = Object.fromEntries(MEIOS.map((m) => [m.value, m.label]));
export const rotuloMeio = (meio) => ROTULO[meio] || meio;

export function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "2", "2,5", "2.50" -> 250. Vazio ou invalido -> null.
export function paraCentavos(texto) {
  const limpo = String(texto ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}

export const centavosDe = (valor) => Math.round(Number(valor || 0) * 100);
export const linhaVazia = (meio = "dinheiro") => ({ meio, valor: "" });

// Situacao dos valores informados em relacao ao total (centavos).
export function situacaoPagamento(totalCentavos, linhas) {
  const invalidas = linhas.filter((l) => l.valor !== "" && !(paraCentavos(l.valor) > 0));
  const informado = linhas.reduce((soma, l) => soma + (paraCentavos(l.valor) > 0 ? paraCentavos(l.valor) : 0), 0);
  const restante = totalCentavos - informado;
  return {
    informado,
    restante,
    invalidas: invalidas.length,
    quitado: restante === 0 && invalidas.length === 0 && informado > 0,
  };
}

// Lista enviada a API: so linhas com valor positivo.
export function paraApi(linhas) {
  return linhas
    .filter((l) => paraCentavos(l.valor) > 0)
    .map((l) => ({ meio: l.meio, valor: paraCentavos(l.valor) / 100 }));
}

// Soma por meio para comparar devolucao e pagamento original.
function porMeio(lista) {
  const mapa = new Map();
  for (const item of lista) mapa.set(item.meio, (mapa.get(item.meio) || 0) + centavosDe(item.valor));
  return mapa;
}

export function mesmosMeios(a, b) {
  const ma = porMeio(a);
  const mb = porMeio(b);
  if (ma.size !== mb.size) return false;
  for (const [meio, valor] of ma) if (mb.get(meio) !== valor) return false;
  return true;
}

export function resumoMeios(meios = []) {
  return meios.map((m) => `${m.rotulo || rotuloMeio(m.meio)} ${formatarMoeda(m.recebido)}`).join(" · ");
}

// Editor de valores por meio com total, informado e saldo.
// `rotuloSaldo` muda o texto ("Faltam" na venda, "Faltam devolver" no estorno).
export function ValoresPorMeio({ legenda, totalCentavos, linhas, onChange, rotuloSaldo = "Faltam", idPrefixo, meios = MEIOS }) {
  const situacao = situacaoPagamento(totalCentavos, linhas);
  const atualizar = (indice, campo, valor) => onChange(linhas.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)));
  const completar = () => {
    if (situacao.restante <= 0) return;
    const vazia = linhas.findIndex((l) => l.valor === "");
    const valor = (situacao.restante / 100).toFixed(2).replace(".", ",");
    if (vazia >= 0) atualizar(vazia, "valor", valor);
    else onChange([...linhas, { meio: meios.find((m) => !linhas.some((l) => l.meio === m.value))?.value || "pix", valor }]);
  };

  return (
    <fieldset className="gym-pay" aria-label={legenda}>
      <legend className="gym-pay__legend">{legenda}</legend>
      {linhas.map((linha, indice) => (
        <div className="gym-pay__row" key={indice}>
          <Select
            id={`${idPrefixo}-meio-${indice}`}
            label={`Meio ${indice + 1}`}
            value={linha.meio}
            onChange={(e) => atualizar(indice, "meio", e.target.value)}
          >
            {meios.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Select>
          <Input
            id={`${idPrefixo}-valor-${indice}`}
            label={`Valor ${indice + 1} (R$)`}
            inputMode="decimal"
            placeholder="0,00"
            value={linha.valor}
            onChange={(e) => atualizar(indice, "valor", e.target.value)}
          />
          {linhas.length > 1 && (
            <Button type="button" size="sm" variant="ghost" aria-label={`Remover linha ${indice + 1}`}
              onClick={() => onChange(linhas.filter((_, i) => i !== indice))}>
              Remover
            </Button>
          )}
        </div>
      ))}
      <div className="gym-pay__actions">
        {linhas.length < meios.length + 2 && (
          <Button type="button" size="sm" variant="secondary"
            onClick={() => onChange([...linhas, linhaVazia(meios.find((m) => !linhas.some((l) => l.meio === m.value))?.value || "pix")])}>
            Adicionar meio
          </Button>
        )}
        {situacao.restante > 0 && (
          <Button type="button" size="sm" variant="ghost" onClick={completar}>Completar com o saldo</Button>
        )}
      </div>
      <dl className="gym-sale-summary" aria-live="polite">
        <div><dt>Total</dt><dd>{formatarMoeda(totalCentavos / 100)}</dd></div>
        <div><dt>Valor informado</dt><dd>{formatarMoeda(situacao.informado / 100)}</dd></div>
        <div className={`gym-pay__status ${situacao.quitado ? "is-ok" : "is-pending"}`}>
          <dt>Saldo</dt>
          <dd data-testid={`${idPrefixo}-saldo`}>
            {situacao.invalidas > 0 ? "Corrija os valores (até duas casas decimais)"
              : situacao.restante > 0 ? `${rotuloSaldo} ${formatarMoeda(situacao.restante / 100)}`
                : situacao.restante < 0 ? `Passou ${formatarMoeda(-situacao.restante / 100)} do total`
                  : "Quitado"}
          </dd>
        </div>
      </dl>
    </fieldset>
  );
}

// Conferencia de uma venda: recebido, devolvido e liquido por meio.
export function ConferenciaMeios({ conferencia, titulo = "Conferência por meio" }) {
  if (!conferencia) return null;
  if (!conferencia.pagamento_registrado && !conferencia.devolucoes?.length) {
    return (
      <p className="gym-pay__note" data-testid="sem-meio-registrado">
        Venda anterior ao pagamento por meio: o meio de pagamento não foi registrado.
      </p>
    );
  }
  return (
    <div className="ui-table-wrap" data-testid="conferencia-meios">
      <table className="ui-table gym-pay-table" aria-label={titulo}>
        <caption className="gym-pay__caption">{titulo}</caption>
        <thead>
          <tr><th>Meio</th><th>Recebido</th><th>Devolvido</th><th>Líquido</th></tr>
        </thead>
        <tbody>
          {conferencia.meios.map((m) => (
            <tr key={m.meio} data-meio={m.meio}>
              <td>{m.rotulo || rotuloMeio(m.meio)}</td>
              <td>{formatarMoeda(m.recebido)}</td>
              <td>{formatarMoeda(m.devolvido)}</td>
              <td className="font-semibold">{formatarMoeda(m.liquido)}</td>
            </tr>
          ))}
          <tr data-meio="total">
            <td className="font-semibold">Total</td>
            <td>{formatarMoeda(conferencia.total_recebido)}</td>
            <td>{formatarMoeda(conferencia.total_devolvido)}</td>
            <td className="font-semibold">{formatarMoeda(conferencia.total_liquido)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
