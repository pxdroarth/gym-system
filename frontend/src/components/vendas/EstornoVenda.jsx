import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import Select from "../ui/Select";
import useAuth from "../../hooks/useAuth";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { UI_PERMISSIONS, getRoleLabel, userHasUiPermission } from "../../utils/permissions";
import {
  aprovarEstornoVenda,
  executarEstornoVenda,
  fetchAutorizadoresEstornoVenda,
  fetchEstornosVenda,
  fetchPoliticaEstornoVenda,
  registrarAutorizacaoExternaEstornoVenda,
  solicitarEstornoVenda,
} from "../../services/vendaProdutoService";

// Estorno de venda (L04, DN-3). Fluxo padrao: o atendente, o gestor, o
// financeiro, o admin ou o dono solicitam com motivo; o gestor (ou dono/admin)
// aprova no sistema, ou um operador registra a autorizacao que o gestor deu
// por WhatsApp ou e-mail; o atendente, o financeiro, o admin ou o dono
// executam com aprovacao valida. A unidade pode exigir tres contas distintas.
// A interface mostra o estado, a origem da autorizacao e as acoes do papel; o
// backend valida identidade, papel, Rede, Unidade e periodo em cada etapa.

const ESTADOS = {
  solicitada: { label: "Estorno solicitado", tone: "amber" },
  aprovada: { label: "Estorno aprovado", tone: "blue" },
  executada: { label: "Estornada", tone: "red" },
  encerrada: { label: "Pedido encerrado", tone: "gray" },
};

const CANAIS = { whatsapp: "WhatsApp", email: "e-mail" };

// Mensagens de recusa pelo codigo do backend; outros erros usam a mensagem da API.
const MENSAGENS = {
  AUTOAPROVACAO_PROIBIDA: "Quem solicitou o estorno não pode autorizá-lo. Peça a outro gestor, admin ou dono da unidade.",
  AUTOAUTORIZACAO_PROIBIDA: "Você não pode se informar como autorizador. Informe o gestor que autorizou.",
  AUTORIZADOR_SEM_PERMISSAO: "A conta informada não pode autorizar estornos nesta unidade.",
  AUTORIZADOR_OBRIGATORIO: "Informe quem autorizou.",
  CANAL_AUTORIZACAO_INVALIDO: "Escolha WhatsApp ou e-mail.",
  REFERENCIA_AUTORIZACAO_OBRIGATORIA: "Informe a referência da mensagem ou do e-mail.",
  DATA_AUTORIZACAO_INVALIDA: "Data da autorização inválida: informe uma data existente, a partir do horário da venda e até agora (horas e minutos).",
  VENDA_SEM_RECEITA_ORIGINAL: "A venda não tem o lançamento de receita original nesta unidade. Peça a conciliação no Financeiro; a autorização continua válida.",
  CONTAS_DISTINTAS_EXIGIDAS: "Esta unidade exige três contas distintas: quem solicitou ou autorizou não executa.",
  REVERSAO_APROVACAO_NECESSARIA: "O estorno ainda não foi autorizado.",
  PERIODO_FECHADO: "Período fechado. Peça ao dono para reabrir o mês; a autorização continua válida para nova tentativa.",
  ESTORNO_JA_EXECUTADO: "Este estorno já foi executado.",
  ESTORNO_JA_APROVADO: "Este pedido já foi autorizado.",
  ESTORNO_STATUS_ALTERADO: "O pedido mudou de estado. Confira a situação atualizada.",
  ESTORNO_ENCERRADO: "Pedido encerrado.",
  VENDA_JA_REVERTIDA: "A venda já foi estornada.",
  QUANTIDADE_REPOSTA_INVALIDA: "Informe uma quantidade inteira entre zero e a quantidade vendida.",
  MOTIVO_OBRIGATORIO: "Informe o motivo do estorno.",
  PERMISSAO_NEGADA: "Seu papel não pode executar esta etapa do estorno.",
  UNIT_FORBIDDEN: "A unidade selecionada não está autorizada para você.",
};

export function mensagemRecusaEstorno(error) {
  const code = error?.response?.data?.code;
  return MENSAGENS[code] || getApiErrorMessage(error);
}

export function EstornoBadge({ status }) {
  if (!status) return <span className="text-sm text-gray-400">—</span>;
  const estado = ESTADOS[status] || { label: status, tone: "gray" };
  return <Badge tone={estado.tone}>{estado.label}</Badge>;
}

export function usePermissoesEstorno() {
  const { user } = useAuth();
  const solicitar = userHasUiPermission(user, UI_PERMISSIONS.VENDAS_ESTORNO_SOLICITAR);
  const aprovar = userHasUiPermission(user, UI_PERMISSIONS.VENDAS_ESTORNO_APROVAR);
  const registrar = userHasUiPermission(user, UI_PERMISSIONS.VENDAS_ESTORNO_REGISTRAR_AUTORIZACAO);
  const executar = userHasUiPermission(user, UI_PERMISSIONS.VENDAS_ESTORNO_EXECUTAR);
  return {
    user,
    solicitar,
    aprovar,
    registrar,
    executar,
    dono: user?.papel === "owner",
    algum: solicitar || aprovar || registrar || executar,
  };
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Fuso da unidade, o mesmo do servidor (APP_TIMEZONE). Horarios do estorno sao
// mostrados e informados nele, independente do relogio do navegador.
const FUSO_UNIDADE = import.meta.env.VITE_APP_TIMEZONE || "America/Sao_Paulo";

function formatarHorario(valor) {
  return valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: FUSO_UNIDADE }) : "—";
}

function pessoa(nome, id, papel) {
  const quem = nome || `conta ${id}`;
  return papel ? `${quem} (${getRoleLabel(papel)})` : quem;
}

// Valor inicial do campo datetime-local: agora, em horas e minutos, no fuso da unidade.
function agoraLocal() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_UNIDADE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const v = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}`;
}

const mesmaConta = (a, b) => a != null && b != null && String(a) === String(b);

export function origemAutorizacao(p) {
  if (!p?.aprovado_em) return null;
  if (!p.autorizacao_canal || p.autorizacao_canal === "sistema") return "Aprovação no sistema";
  return `Autorização externa via ${CANAIS[p.autorizacao_canal] || p.autorizacao_canal}`;
}

// Etapas do pedido: quem atuou em cada uma e quando.
function EtapasPedido({ p }) {
  const externa = p.autorizacao_canal && p.autorizacao_canal !== "sistema";
  return (
    <dl className="mt-1 grid gap-1 text-sm" aria-label={`Etapas do pedido ${p.id}`}>
      <div>
        <dt className="inline font-medium">Solicitação: </dt>
        <dd className="inline">{pessoa(p.solicitado_por_nome, p.solicitado_por, p.solicitado_por_papel)} em {formatarHorario(p.solicitado_em)}</dd>
      </div>
      {p.aprovado_em && !externa && (
        <div>
          <dt className="inline font-medium">Aprovação no sistema: </dt>
          <dd className="inline">{pessoa(p.aprovado_por_nome, p.aprovado_por, p.aprovado_por_papel)} em {formatarHorario(p.aprovado_em)}</dd>
        </div>
      )}
      {p.aprovado_em && externa && (
        <>
          <div>
            <dt className="inline font-medium">Autorização externa ({CANAIS[p.autorizacao_canal] || p.autorizacao_canal}): </dt>
            <dd className="inline">
              {pessoa(p.aprovado_por_nome, p.aprovado_por, p.aprovado_por_papel)} em {formatarHorario(p.aprovado_em)}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">Registrada por: </dt>
            <dd className="inline">
              {pessoa(p.autorizacao_registrada_por_nome, p.autorizacao_registrada_por, p.autorizacao_registrada_por_papel)} em{" "}
              {formatarHorario(p.autorizacao_registrada_em)}
            </dd>
          </div>
          <div>
            <dt className="inline font-medium">Referência: </dt>
            <dd className="inline">{p.autorizacao_referencia}</dd>
          </div>
          <p className="text-xs text-amber-700">
            Autorização externa declarada por quem a registrou; o autorizador não confirmou no sistema.
          </p>
        </>
      )}
      {p.executado_em && (
        <div>
          <dt className="inline font-medium">Execução: </dt>
          <dd className="inline">
            {pessoa(p.executado_por_nome, p.executado_por, p.executado_por_papel)} em {formatarHorario(p.executado_em)} ·{" "}
            {p.quantidade_reposta} de {p.quantidade_vendida} reposta(s) ao estoque
          </dd>
        </div>
      )}
      {p.encerrado_motivo && <div>{p.encerrado_motivo}</div>}
    </dl>
  );
}

// Modal da venda: lista os pedidos de estorno e mostra as acoes cabiveis ao
// papel na unidade. `venda` precisa de id, produto_id, produto_nome,
// quantidade e valor_total.
export function EstornoVendaModal({ venda, onClose, onChanged }) {
  const perm = usePermissoesEstorno();
  const [pedidos, setPedidos] = useState([]);
  const [politica, setPolitica] = useState({ contas_distintas: false });
  const [autorizadores, setAutorizadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [externa, setExterna] = useState({ autorizador_id: "", canal: "whatsapp", quando: agoraLocal(), referencia: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const [lista, pol] = await Promise.all([
        fetchEstornosVenda({ venda_id: venda.id }),
        fetchPoliticaEstornoVenda().catch(() => ({ contas_distintas: false })),
      ]);
      setPedidos(lista);
      setPolitica(pol);
    } catch (error) {
      setErro(mensagemRecusaEstorno(error));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [venda.id]);

  const executado = pedidos.find((p) => p.status === "executada");
  const aberto = pedidos.find((p) => p.status === "aprovada") || pedidos.find((p) => p.status === "solicitada");
  const valorTotal = venda.valor_total ?? Number(venda.preco_unitario || 0) * Number(venda.quantidade || 0);
  const podeRegistrar = perm.registrar && aberto?.status === "solicitada";

  useEffect(() => {
    if (!podeRegistrar) return;
    fetchAutorizadoresEstornoVenda()
      .then((lista) => setAutorizadores(lista))
      .catch(() => setAutorizadores([]));
  }, [podeRegistrar, aberto?.id]);

  async function agir(acao, sucesso) {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await acao();
      toast.success(sucesso);
      setMotivo("");
      setQuantidade("");
      setExterna({ autorizador_id: "", canal: "whatsapp", quando: agoraLocal(), referencia: "" });
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
  const qtdNumero = quantidade === "" ? NaN : Number(quantidade);
  const qtdValida = Number.isInteger(qtdNumero) && qtdNumero >= 0 && qtdNumero <= Number(venda.quantidade || 0);

  function enviarExterna(event) {
    event.preventDefault();
    if (!externa.autorizador_id) return setErro(MENSAGENS.AUTORIZADOR_OBRIGATORIO);
    if (externa.referencia.trim().length < 3) return setErro(MENSAGENS.REFERENCIA_AUTORIZACAO_OBRIGATORIA);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(externa.quando)) return setErro(MENSAGENS.DATA_AUTORIZACAO_INVALIDA);
    // Envia o horario de parede (horas e minutos); o servidor interpreta no
    // fuso da unidade, valida o calendario e compara por minuto.
    return agir(
      () => registrarAutorizacaoExternaEstornoVenda(aberto.id, {
        autorizador_id: Number(externa.autorizador_id),
        canal: externa.canal,
        autorizado_em: externa.quando,
        referencia: externa.referencia.trim(),
      }),
      "Autorização externa registrada."
    );
  }

  return (
    <Modal title={`Estorno da venda #${venda.id}`} onClose={onClose} className="max-w-2xl">
      <div className="space-y-4">
        <div className="sales-modal-summary">
          <div className="sales-modal-summary__item">
            <div className="sales-modal-summary__label">Produto</div>
            <div className="sales-modal-summary__value">{venda.produto_nome}</div>
          </div>
          <div className="sales-modal-summary__item">
            <div className="sales-modal-summary__label">Quantidade vendida</div>
            <div className="sales-modal-summary__value">{venda.quantidade}</div>
          </div>
          <div className="sales-modal-summary__item">
            <div className="sales-modal-summary__label">Valor estornado</div>
            <div className="sales-modal-summary__value">{formatarMoeda(valorTotal)} (integral)</div>
          </div>
        </div>

        {politica.contas_distintas && (
          <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800" data-testid="aviso-tres-contas">
            Esta unidade exige três contas distintas: solicitante, autorizador e executor.
          </p>
        )}

        {carregando ? (
          <p className="text-sm text-gray-500">Carregando pedidos...</p>
        ) : pedidos.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum pedido de estorno para esta venda.</p>
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
                <EtapasPedido p={p} />
              </li>
            ))}
          </ul>
        )}

        {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {!carregando && !executado && (
          <div className="space-y-4">
            {perm.solicitar && !aberto && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!motivo.trim()) {
                    setErro(MENSAGENS.MOTIVO_OBRIGATORIO);
                    return;
                  }
                  agir(() => solicitarEstornoVenda(venda.id, motivo.trim()), "Estorno solicitado.");
                }}
              >
                <label className="ui-field">
                  <span className="ui-field__label">Motivo do estorno</span>
                  <textarea className="ui-input min-h-20" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                </label>
                <div className="flex justify-end">
                  <Button type="submit" disabled={enviando}>{enviando ? "Enviando..." : "Solicitar estorno"}</Button>
                </div>
              </form>
            )}

            {perm.aprovar && aberto?.status === "solicitada" && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600">
                  {proprioPedido ? "Você solicitou este estorno e não pode aprová-lo." : "Confira o motivo e aprove no sistema."}
                </span>
                <Button
                  disabled={enviando || proprioPedido}
                  onClick={() => agir(() => aprovarEstornoVenda(aberto.id), "Estorno aprovado.")}
                >
                  Aprovar estorno
                </Button>
              </div>
            )}

            {podeRegistrar && (
              <form noValidate className="space-y-2 rounded border border-gray-200 p-3" onSubmit={enviarExterna} aria-label="Registrar autorização externa">
                <div className="font-semibold text-sm">Registrar autorização recebida por WhatsApp ou e-mail</div>
                <p className="text-xs text-gray-500">
                  O registro fica como autorização declarada por você. Informe quem autorizou, o canal, quando e uma referência
                  da mensagem (grupo, horário, assunto do e-mail).
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    label="Quem autorizou"
                    value={externa.autorizador_id}
                    onChange={(e) => setExterna({ ...externa, autorizador_id: e.target.value })}
                  >
                    <option value="">Selecione</option>
                    {autorizadoresValidos.map((a) => (
                      <option key={a.id} value={a.id}>{a.nome} ({getRoleLabel(a.papel)})</option>
                    ))}
                  </Select>
                  <Select label="Canal" value={externa.canal} onChange={(e) => setExterna({ ...externa, canal: e.target.value })}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                  </Select>
                  <Input
                    label="Data e hora da autorização (horário da unidade)"
                    type="datetime-local"
                    value={externa.quando}
                    onChange={(e) => setExterna({ ...externa, quando: e.target.value })}
                  />
                  <Input
                    label="Referência da mensagem ou e-mail"
                    value={externa.referencia}
                    maxLength={500}
                    onChange={(e) => setExterna({ ...externa, referencia: e.target.value })}
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary" disabled={enviando}>Registrar autorização externa</Button>
                </div>
              </form>
            )}

            {perm.executar && aberto?.status === "aprovada" && (
              <form
                noValidate
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!qtdValida) {
                    setErro(MENSAGENS.QUANTIDADE_REPOSTA_INVALIDA);
                    return;
                  }
                  agir(
                    () => executarEstornoVenda(aberto.id, [{ produto_id: venda.produto_id, quantidade_reposta: qtdNumero }]),
                    "Estorno executado."
                  );
                }}
              >
                <Input
                  label={`Unidades recebidas em condição de venda (0 a ${venda.quantidade})`}
                  type="number"
                  min="0"
                  max={venda.quantidade}
                  step="1"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  O valor da venda é estornado por inteiro. Só a quantidade informada volta ao estoque; itens consumidos,
                  avariados ou não devolvidos ficam fora do estoque disponível.
                </p>
                {bloqueioTresContas && <p className="text-sm text-amber-700">{MENSAGENS.CONTAS_DISTINTAS_EXIGIDAS}</p>}
                <div className="flex justify-end">
                  <Button type="submit" variant="danger" disabled={enviando || bloqueioTresContas}>
                    {enviando ? "Executando..." : "Executar estorno"}
                  </Button>
                </div>
              </form>
            )}

            {aberto && !((perm.aprovar || perm.registrar) && aberto.status === "solicitada") && !(perm.executar && aberto.status === "aprovada") && (
              <p className="text-sm text-gray-500">
                {aberto.status === "solicitada"
                  ? "Aguardando autorização do gestor (no sistema ou registrada a partir de WhatsApp ou e-mail)."
                  : "Autorizado. Aguardando execução por quem tem a permissão na unidade."}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
