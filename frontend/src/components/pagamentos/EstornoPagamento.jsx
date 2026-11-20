import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import Select from "../ui/Select";
import useAuth from "../../hooks/useAuth";
import { UI_PERMISSIONS, getRoleLabel, userHasUiPermission } from "../../utils/permissions";
import {
  EstornoBadge,
  EtapasPedido,
  agoraLocal,
  formatarHorario,
  mensagemRecusaEstorno,
  origemAutorizacao,
} from "../vendas/EstornoVenda";
import { ValoresPorMeio, centavosDe, linhaVazia, paraApi, situacaoPagamento } from "../vendas/PagamentoPorMeio";
import {
  aprovarEstornoPagamento,
  executarEstornoPagamento,
  fetchAutorizadoresEstornoPagamento,
  fetchEstornosPagamento,
  fetchPoliticaEstornoPagamento,
  registrarAutorizacaoExternaEstornoPagamento,
  solicitarEstornoPagamento,
} from "../../services/pagamentoService";

// Estorno de pagamento do aluno (L04, sublote A). Recepcao, gestor,
// financeiro, admin e dono solicitam com motivo; admin ou dono aprova no
// sistema, ou um operador registra a autorizacao que eles deram por WhatsApp
// ou e-mail; financeiro, admin ou dono executam, confirmando a devolucao por
// meio. O servidor valida papel, unidade, periodo e uso unico da aprovacao.

export const MEIOS_PAGAMENTO = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "transferencia", label: "Transferência" },
];
const ROTULO = Object.fromEntries(MEIOS_PAGAMENTO.map((m) => [m.value, m.label]));
export const rotuloMeioPagamento = (meio) => (meio ? ROTULO[meio] || meio : "Meio não registrado");

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatarData(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "-";
}
const mesmaConta = (a, b) => a != null && b != null && String(a) === String(b);

export function usePermissoesEstornoPagamento() {
  const { user } = useAuth();
  const tem = (p) => userHasUiPermission(user, p);
  const solicitar = tem(UI_PERMISSIONS.PAGAMENTOS_ESTORNO_SOLICITAR);
  const aprovar = tem(UI_PERMISSIONS.PAGAMENTOS_ESTORNO_APROVAR);
  const registrar = tem(UI_PERMISSIONS.PAGAMENTOS_ESTORNO_REGISTRAR_AUTORIZACAO);
  const executar = tem(UI_PERMISSIONS.PAGAMENTOS_ESTORNO_EXECUTAR);
  return { user, solicitar, aprovar, registrar, executar, dono: user?.papel === "owner", algum: solicitar || aprovar || registrar || executar };
}

const STATUS_MENSALIDADE = { pago: "Paga", parcial: "Parcial", em_aberto: "Em aberto", vencido: "Vencida" };

// Conteudo do estorno de um pagamento. `pagamento` precisa de id, valor_pago,
// data_pagamento e forma_pagamento.
export function EstornoPagamentoPainel({ pagamento, onChanged }) {
  const perm = usePermissoesEstornoPagamento();
  const [pedidos, setPedidos] = useState([]);
  const [politica, setPolitica] = useState({ contas_distintas: false });
  const [autorizadores, setAutorizadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [externa, setExterna] = useState({ autorizador_id: "", canal: "whatsapp", quando: agoraLocal(), referencia: "" });
  const [devolucao, setDevolucao] = useState([linhaVazia()]);
  const [confirmada, setConfirmada] = useState(false);
  const [motivoTroca, setMotivoTroca] = useState("");
  const [comprovante, setComprovante] = useState("");
  const [registrarMeioLegado, setRegistrarMeioLegado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);

  async function carregar() {
    setCarregando(true);
    try {
      const [lista, pol] = await Promise.all([
        fetchEstornosPagamento({ pagamento_id: pagamento.id }),
        fetchPoliticaEstornoPagamento().catch(() => ({ contas_distintas: false })),
      ]);
      setPedidos(lista);
      setPolitica(pol);
    } catch (error) {
      setErro(mensagemRecusaEstorno(error));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [pagamento.id]);

  const executado = pedidos.find((p) => p.status === "executada");
  const aberto = pedidos.find((p) => p.status === "aprovada") || pedidos.find((p) => p.status === "solicitada");
  const totalCentavos = centavosDe(pagamento.valor_pago);
  const meioOriginal = pagamento.forma_pagamento || null;
  const podeRegistrar = perm.registrar && aberto?.status === "solicitada";

  function sugerirMesmoMeio() {
    setDevolucao([{ meio: meioOriginal || "dinheiro", valor: (totalCentavos / 100).toFixed(2).replace(".", ",") }]);
  }
  useEffect(() => { if (aberto?.status === "aprovada") sugerirMesmoMeio(); }, [aberto?.id, aberto?.status]);
  useEffect(() => {
    if (!podeRegistrar) return;
    fetchAutorizadoresEstornoPagamento().then(setAutorizadores).catch(() => setAutorizadores([]));
  }, [podeRegistrar, aberto?.id]);

  async function agir(acao, sucesso) {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await acao();
      if (r?.acesso) setResultado(r);
      toast.success(sucesso);
      setMotivo("");
      setExterna({ autorizador_id: "", canal: "whatsapp", quando: agoraLocal(), referencia: "" });
      setConfirmada(false);
      setMotivoTroca("");
      setComprovante("");
      await carregar();
      onChanged?.();
    } catch (error) {
      const mensagem = mensagemRecusaEstorno(error);
      setErro(mensagem);
      toast.error(mensagem);
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  const meuId = perm.user?.id;
  const proprioPedido = aberto && mesmaConta(aberto.solicitado_por, meuId);
  const autorizadoresValidos = autorizadores.filter((a) => !mesmaConta(a.id, aberto?.solicitado_por));
  const bloqueioTresContas = politica.contas_distintas && aberto?.status === "aprovada"
    && (mesmaConta(aberto.solicitado_por, meuId) || mesmaConta(aberto.aprovado_por, meuId));
  const informaDevolucao = Boolean(meioOriginal) || registrarMeioLegado;
  const situacao = situacaoPagamento(totalCentavos, devolucao);
  const devolucaoApi = paraApi(devolucao);
  const meioAlternativo = Boolean(meioOriginal) && situacao.quitado && devolucaoApi.some((d) => d.meio !== meioOriginal);

  function enviarExterna(event) {
    event.preventDefault();
    if (!externa.autorizador_id) return setErro("Informe quem autorizou.");
    if (externa.referencia.trim().length < 3) return setErro("Informe a referência da mensagem ou do e-mail.");
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(externa.quando)) return setErro("Data da autorização inválida.");
    return agir(() => registrarAutorizacaoExternaEstornoPagamento(aberto.id, {
      autorizador_id: Number(externa.autorizador_id),
      canal: externa.canal,
      autorizado_em: externa.quando,
      referencia: externa.referencia.trim(),
    }), "Autorização externa registrada.");
  }

  function enviarExecucao(event) {
    event.preventDefault();
    const dados = {};
    if (informaDevolucao) {
      if (!situacao.quitado) return setErro("O estorno é integral: os valores devolvidos precisam somar o valor do pagamento.");
      if (meioAlternativo && motivoTroca.trim().length < 3) return setErro("Informe o motivo da devolução em outro meio.");
      if (meioAlternativo && comprovante.trim().length < 3) return setErro("Informe a referência do comprovante da devolução.");
      if (!confirmada) return setErro("Confirme que a devolução ao aluno foi feita.");
      Object.assign(dados, {
        devolucoes: devolucaoApi,
        devolucao_confirmada: true,
        motivo_troca_meio: meioAlternativo ? motivoTroca.trim() : undefined,
        comprovante_referencia: comprovante.trim() || undefined,
      });
    }
    return agir(() => executarEstornoPagamento(aberto.id, dados), "Estorno executado.");
  }

  return (
    <div className="space-y-4">
      <div className="sales-modal-summary">
        <div className="sales-modal-summary__item">
          <div className="sales-modal-summary__label">Pagamento</div>
          <div className="sales-modal-summary__value">#{pagamento.id} · {formatarData(pagamento.data_pagamento)}</div>
        </div>
        <div className="sales-modal-summary__item">
          <div className="sales-modal-summary__label">Meio</div>
          <div className="sales-modal-summary__value" data-testid="meio-original">{rotuloMeioPagamento(meioOriginal)}</div>
        </div>
        <div className="sales-modal-summary__item">
          <div className="sales-modal-summary__label">Valor estornado</div>
          <div className="sales-modal-summary__value">{formatarMoeda(pagamento.valor_pago)} (integral)</div>
        </div>
      </div>

      {politica.contas_distintas && (
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Esta unidade exige três contas distintas: solicitante, autorizador e executor.
        </p>
      )}

      {carregando ? <p className="text-sm text-gray-500">Carregando pedidos...</p> : pedidos.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum pedido de estorno para este pagamento.</p>
      ) : (
        <ul className="space-y-2" aria-label="Pedidos de estorno">
          {pedidos.map((p) => (
            <li key={p.id} className="rounded border border-gray-200 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">Pedido #{p.id}</span>
                <span className="flex flex-wrap items-center gap-2">
                  {origemAutorizacao(p) && <Badge tone={p.autorizacao_canal === "sistema" ? "green" : "amber"}>{origemAutorizacao(p)}</Badge>}
                  <EstornoBadge status={p.status} />
                </span>
              </div>
              <div>Motivo: {p.motivo}</div>
              <EtapasPedido p={{ ...p, quantidade_reposta: undefined }} />
              {p.status === "executada" && (
                <div className="gym-pay__done" data-testid="devolucao-pagamento">
                  {p.devolucoes?.length > 0 ? (
                    <div className="font-medium">
                      Devolvido: {p.devolucoes.map((d) => `${d.rotulo || rotuloMeioPagamento(d.meio)} ${formatarMoeda(d.valor)}`).join(" · ")}
                      {p.devolucao_meio_alternativo === 1 && <Badge tone="amber" className="ml-2">Outro meio</Badge>}
                    </div>
                  ) : <div>Devolução sem meio registrado (pagamento anterior ao registro por meio).</div>}
                  {p.devolucao_motivo && <div>Motivo da troca de meio: {p.devolucao_motivo}</div>}
                  {p.devolucao_comprovante && <div>Comprovante: {p.devolucao_comprovante}</div>}
                  {p.status_mensalidade_depois && <div>Mensalidade após o estorno: {STATUS_MENSALIDADE[p.status_mensalidade_depois] || p.status_mensalidade_depois}</div>}
                  {p.devolucao_confirmada_em && <div>Devolução confirmada pelo operador em {formatarHorario(p.devolucao_confirmada_em)}</div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {resultado?.acesso && (
        <p data-testid="acesso-reavaliado" className={`rounded border px-3 py-2 text-sm ${resultado.acesso.liberado ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          Acesso reavaliado: {resultado.acesso.liberado ? "entrada liberada" : "entrada bloqueada"}. Mensalidade {STATUS_MENSALIDADE[resultado.status_mensalidade] || resultado.status_mensalidade}, saldo em aberto {formatarMoeda(resultado.saldo_em_aberto)}.
        </p>
      )}

      {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

      {!carregando && !executado && (
        <div className="space-y-4">
          {perm.solicitar && !aberto && (
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (!motivo.trim()) return setErro("Informe o motivo do estorno.");
              return agir(() => solicitarEstornoPagamento(pagamento.id, motivo.trim()), "Estorno solicitado.");
            }}>
              <label className="ui-field">
                <span className="ui-field__label">Motivo do estorno</span>
                <textarea className="ui-input min-h-20" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </label>
              <div className="flex justify-end"><Button type="submit" disabled={enviando}>Solicitar estorno</Button></div>
            </form>
          )}

          {perm.aprovar && aberto?.status === "solicitada" && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">
                {proprioPedido ? "Você solicitou este estorno e não pode aprová-lo." : "Confira o motivo e aprove no sistema."}
              </span>
              <Button disabled={enviando || proprioPedido} onClick={() => agir(() => aprovarEstornoPagamento(aberto.id), "Estorno aprovado.")}>
                Aprovar estorno
              </Button>
            </div>
          )}

          {podeRegistrar && (
            <form noValidate className="space-y-2 rounded border border-gray-200 p-3" onSubmit={enviarExterna} aria-label="Registrar autorização externa">
              <div className="font-semibold text-sm">Registrar autorização recebida por WhatsApp ou e-mail</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select label="Quem autorizou" value={externa.autorizador_id} onChange={(e) => setExterna({ ...externa, autorizador_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {autorizadoresValidos.map((a) => <option key={a.id} value={a.id}>{a.nome} ({getRoleLabel(a.papel)})</option>)}
                </Select>
                <Select label="Canal" value={externa.canal} onChange={(e) => setExterna({ ...externa, canal: e.target.value })}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                </Select>
                <Input label="Data e hora da autorização (horário da unidade)" type="datetime-local" value={externa.quando}
                  onChange={(e) => setExterna({ ...externa, quando: e.target.value })} />
                <Input label="Referência da mensagem ou e-mail" value={externa.referencia} maxLength={500}
                  onChange={(e) => setExterna({ ...externa, referencia: e.target.value })} />
              </div>
              <div className="flex justify-end"><Button type="submit" variant="secondary" disabled={enviando}>Registrar autorização externa</Button></div>
            </form>
          )}

          {perm.executar && aberto?.status === "aprovada" && (
            <form noValidate className="space-y-3" onSubmit={enviarExecucao} aria-label="Executar estorno">
              {!meioOriginal && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={registrarMeioLegado} onChange={(e) => setRegistrarMeioLegado(e.target.checked)} />
                  Registrar o meio usado na devolução (o meio do pagamento original não foi registrado)
                </label>
              )}
              {informaDevolucao && (
                <>
                  <ValoresPorMeio legenda="Devolução ao aluno" idPrefixo="devolucao-pagamento" rotuloSaldo="Faltam devolver"
                    totalCentavos={totalCentavos} linhas={devolucao} onChange={setDevolucao} meios={MEIOS_PAGAMENTO} />
                  {meioOriginal && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>Sugestão: devolver pelo mesmo meio do pagamento ({rotuloMeioPagamento(meioOriginal)}).</span>
                      <Button type="button" size="sm" variant="ghost" onClick={sugerirMesmoMeio}>Usar o meio do pagamento</Button>
                    </div>
                  )}
                  {meioAlternativo && (
                    <>
                      <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" data-testid="aviso-meio-alternativo">
                        Devolução em meio diferente do pagamento. Registre o motivo combinado com o aluno e a referência do comprovante.
                      </p>
                      <Input label="Motivo da devolução em outro meio" value={motivoTroca} maxLength={300} onChange={(e) => setMotivoTroca(e.target.value)} />
                    </>
                  )}
                  <Input label={meioAlternativo ? "Referência do comprovante" : "Referência do comprovante (opcional)"} value={comprovante}
                    maxLength={500} onChange={(e) => setComprovante(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={confirmada} onChange={(e) => setConfirmada(e.target.checked)} />
                    Confirmo que a devolução ao aluno foi feita nesses valores
                  </label>
                </>
              )}
              <p className="text-xs text-gray-500">
                O pagamento é estornado por inteiro. A competência e as datas de cobertura não mudam; a situação da mensalidade e o acesso são recalculados.
              </p>
              {bloqueioTresContas && <p className="text-sm text-amber-700">Esta unidade exige três contas distintas: quem solicitou ou autorizou não executa.</p>}
              <div className="flex justify-end">
                <Button type="submit" variant="danger" disabled={enviando || bloqueioTresContas}>{enviando ? "Executando..." : "Executar estorno"}</Button>
              </div>
            </form>
          )}

          {aberto && !((perm.aprovar || perm.registrar) && aberto.status === "solicitada") && !(perm.executar && aberto.status === "aprovada") && (
            <p className="text-sm text-gray-500">
              {aberto.status === "solicitada"
                ? "Aguardando autorização do dono ou admin (no sistema ou registrada a partir de WhatsApp ou e-mail)."
                : "Autorizado. Aguardando execução pelo Financeiro, admin ou dono."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EstornoPagamentoModal({ pagamento, onClose, onChanged }) {
  return (
    <Modal title={`Estorno do pagamento #${pagamento.id}`} onClose={onClose} className="max-w-2xl">
      <EstornoPagamentoPainel pagamento={pagamento} onChanged={onChanged} />
    </Modal>
  );
}

// Pagamentos de uma mensalidade, com acesso ao estorno de cada um.
export function PagamentosMensalidadeModal({ mensalidade, pagamentos, onClose, onChanged }) {
  const perm = usePermissoesEstornoPagamento();
  const [selecionado, setSelecionado] = useState(null);
  const lista = pagamentos.filter((p) => p.mensalidade_id === mensalidade.id);
  return (
    <Modal title={selecionado ? `Estorno do pagamento #${selecionado.id}` : `Pagamentos da mensalidade de ${formatarData(mensalidade.vencimento)}`}
      onClose={onClose} className="max-w-2xl">
      {selecionado ? (
        <div className="space-y-3">
          <Button size="sm" variant="ghost" onClick={() => setSelecionado(null)}>← Voltar aos pagamentos</Button>
          <EstornoPagamentoPainel pagamento={selecionado} onChanged={onChanged} />
        </div>
      ) : lista.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum pagamento registrado nesta mensalidade.</p>
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table" aria-label="Pagamentos da mensalidade">
            <thead><tr><th>Data</th><th>Valor</th><th>Meio</th><th>Estorno</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} data-pagamento-id={p.id}>
                  <td>{formatarData(p.data_pagamento)}</td>
                  <td>{formatarMoeda(p.valor_pago)}</td>
                  <td>{rotuloMeioPagamento(p.forma_pagamento)}</td>
                  <td>{p.estornado_em ? <Badge tone="red">Estornado</Badge> : <EstornoBadge status={p.estorno_status} />}</td>
                  <td>
                    {perm.algum && (
                      <Button size="sm" variant="secondary" onClick={() => setSelecionado(p)}>Estorno</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
