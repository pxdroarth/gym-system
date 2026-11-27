import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Input from "../ui/Input";
import Modal from "../ui/Modal";
import Select from "../ui/Select";
import useAuth from "../../hooks/useAuth";
import { UI_PERMISSIONS, getRoleLabel, userHasUiPermission } from "../../utils/permissions";
import { EstornoBadge, EtapasPedido, agoraLocal, mensagemRecusaEstorno, origemAutorizacao } from "../vendas/EstornoVenda";
import {
  aprovarEstornoBaixa,
  executarEstornoBaixa,
  fetchAutorizadoresEstornoBaixa,
  fetchEstornosBaixa,
  fetchPoliticaEstornoBaixa,
  marcarComoPago,
  registrarAutorizacaoExternaEstornoBaixa,
  solicitarEstornoBaixa,
} from "../../services/contasFinanceiras";

// Baixa e estorno de baixa de conta financeira (L04, sublote C; decisoes de
// 20/11 e 26/11/2026). A baixa grava data, responsavel e, opcionalmente, o
// meio. O estorno devolve a conta a pendente: financeiro, admin ou dono
// solicitam; admin ou dono aprovam (ou um operador registra a autorizacao dada
// por WhatsApp ou e-mail); financeiro, admin ou dono executam.

export const MEIOS_BAIXA = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "cartao_credito", label: "Cartão de crédito" },
  { value: "cartao_debito", label: "Cartão de débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "boleto", label: "Boleto" },
];
const ROTULO = Object.fromEntries(MEIOS_BAIXA.map((m) => [m.value, m.label]));
export const rotuloMeioBaixa = (meio) => (meio ? ROTULO[meio] || meio : "Meio não registrado");

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function formatarData(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "-";
}
const mesmaConta = (a, b) => a != null && b != null && String(a) === String(b);

const MENSAGENS = {
  CONTA_NAO_BAIXADA: "A conta não está paga.",
  CONTA_JA_REVERTIDA: "A conta já foi revertida.",
  CONTA_FINANCEIRA_DERIVADA_PROTEGIDA: "Lançamento automático: estorne pelo fluxo de origem (venda ou mensalidade).",
  BAIXA_MEIO_INVALIDO: "Meio da baixa inválido.",
  DATA_AUTORIZACAO_INVALIDA: "Data da autorização inválida: informe uma data existente, a partir da data da baixa e até agora.",
  AUTOAPROVACAO_PROIBIDA: "Quem solicitou o estorno não pode autorizá-lo. Peça ao admin ou ao dono.",
};
export function mensagemEstornoBaixa(error) {
  return MENSAGENS[error?.response?.data?.code] || mensagemRecusaEstorno(error);
}

export function usePermissoesEstornoBaixa() {
  const { user } = useAuth();
  const tem = (p) => userHasUiPermission(user, p);
  const solicitar = tem(UI_PERMISSIONS.CONTAS_BAIXA_ESTORNO_SOLICITAR);
  const aprovar = tem(UI_PERMISSIONS.CONTAS_BAIXA_ESTORNO_APROVAR);
  const registrar = tem(UI_PERMISSIONS.CONTAS_BAIXA_ESTORNO_REGISTRAR_AUTORIZACAO);
  const executar = tem(UI_PERMISSIONS.CONTAS_BAIXA_ESTORNO_EXECUTAR);
  return { user, solicitar, aprovar, registrar, executar, dono: user?.papel === "owner", algum: solicitar || aprovar || registrar || executar };
}

export function TextoBaixa({ conta }) {
  if (conta.status !== "pago") return null;
  const data = conta.data_baixa || conta.data_lancamento;
  const estimada = Number(conta.data_baixa_estimada) === 1 || !conta.data_baixa;
  return (
    <span className="block text-xs text-gray-500" data-testid={`baixa-${conta.id}`}>
      Baixa {formatarData(data)}{estimada ? " (estimada)" : ""} · {rotuloMeioBaixa(conta.baixa_meio)}
    </span>
  );
}

// Confirmacao da baixa com o meio opcional.
export function BaixaContaModal({ conta, onClose, onBaixada }) {
  const [meio, setMeio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  async function confirmar(event) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await marcarComoPago(conta.id, meio || undefined);
      toast.success("Baixa registrada.");
      onBaixada?.();
      onClose();
    } catch (error) {
      setErro(mensagemEstornoBaixa(error));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Modal title={`Baixa de ${conta.descricao}`} onClose={onClose} className="max-w-md">
      <form className="space-y-4" onSubmit={confirmar} aria-label="Confirmar baixa">
        <p className="text-sm">{formatarMoeda(conta.valor)} · conta de {formatarData(conta.data_lancamento)}. A data da baixa é a de hoje.</p>
        <Select label="Meio (opcional)" value={meio} onChange={(e) => setMeio(e.target.value)}>
          <option value="">Não informar</option>
          {MEIOS_BAIXA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
        {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        <div className="flex justify-end"><Button type="submit" variant="success" disabled={enviando}>Confirmar baixa</Button></div>
      </form>
    </Modal>
  );
}

// Conteudo do estorno de baixa de uma conta (id, descricao, valor, data_lancamento,
// data_baixa, data_baixa_estimada, baixa_meio, status).
export function EstornoBaixaPainel({ conta: contaInicial, onChanged }) {
  const perm = usePermissoesEstornoBaixa();
  // Estado local da conta: a execucao devolve a conta a pendente sem fechar o modal.
  const [conta, setConta] = useState(contaInicial);
  useEffect(() => { setConta(contaInicial); }, [contaInicial.id]);
  const [pedidos, setPedidos] = useState([]);
  const [politica, setPolitica] = useState({ contas_distintas: false });
  const [autorizadores, setAutorizadores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [motivo, setMotivo] = useState("");
  const [externa, setExterna] = useState({ autorizador_id: "", canal: "whatsapp", quando: agoraLocal(), referencia: "" });
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const [lista, pol] = await Promise.all([
        fetchEstornosBaixa({ conta_id: conta.id }),
        fetchPoliticaEstornoBaixa().catch(() => ({ contas_distintas: false })),
      ]);
      setPedidos(lista);
      setPolitica(pol);
    } catch (error) {
      setErro(mensagemEstornoBaixa(error));
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); }, [conta.id]);

  const aberto = pedidos.find((p) => p.status === "aprovada") || pedidos.find((p) => p.status === "solicitada");
  const podeRegistrar = perm.registrar && aberto?.status === "solicitada";
  useEffect(() => {
    if (!podeRegistrar) return;
    fetchAutorizadoresEstornoBaixa().then(setAutorizadores).catch(() => setAutorizadores([]));
  }, [podeRegistrar, aberto?.id]);

  async function agir(acao, sucesso) {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await acao();
      toast.success(sucesso);
      setMotivo("");
      setConfirmado(false);
      setExterna({ autorizador_id: "", canal: "whatsapp", quando: agoraLocal(), referencia: "" });
      await carregar();
      onChanged?.();
    } catch (error) {
      const mensagem = mensagemEstornoBaixa(error);
      setErro(mensagem);
      toast.error(mensagem);
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  const meuId = perm.user?.id;
  const proprioPedido = aberto && mesmaConta(aberto.solicitado_por, meuId);
  const bloqueioTresContas = politica.contas_distintas && aberto?.status === "aprovada"
    && (mesmaConta(aberto.solicitado_por, meuId) || mesmaConta(aberto.aprovado_por, meuId));
  const contaPaga = conta.status === "pago";

  function enviarExterna(event) {
    event.preventDefault();
    if (!externa.autorizador_id) return setErro("Informe quem autorizou.");
    if (externa.referencia.trim().length < 3) return setErro("Informe a referência da mensagem ou do e-mail.");
    return agir(() => registrarAutorizacaoExternaEstornoBaixa(aberto.id, {
      autorizador_id: Number(externa.autorizador_id),
      canal: externa.canal,
      autorizado_em: externa.quando,
      referencia: externa.referencia.trim(),
    }), "Autorização externa registrada.");
  }

  return (
    <div className="space-y-4">
      <div className="sales-modal-summary">
        <div className="sales-modal-summary__item">
          <div className="sales-modal-summary__label">Conta</div>
          <div className="sales-modal-summary__value">{conta.descricao} · {formatarMoeda(conta.valor)}</div>
        </div>
        <div className="sales-modal-summary__item">
          <div className="sales-modal-summary__label">Baixa</div>
          <div className="sales-modal-summary__value" data-testid="baixa-atual">
            {contaPaga ? `${formatarData(conta.data_baixa || conta.data_lancamento)}${Number(conta.data_baixa_estimada) === 1 || !conta.data_baixa ? " (estimada)" : ""} · ${rotuloMeioBaixa(conta.baixa_meio)}` : "Conta pendente"}
          </div>
        </div>
      </div>

      {politica.contas_distintas && (
        <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          Esta unidade exige três contas distintas: solicitante, autorizador e executor.
        </p>
      )}

      {carregando ? <p className="text-sm text-gray-500">Carregando pedidos...</p> : pedidos.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum pedido de estorno de baixa para esta conta.</p>
      ) : (
        <ul className="space-y-2" aria-label="Pedidos de estorno de baixa">
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
              <div>Baixa estornada: {formatarData(p.data_baixa)}{Number(p.data_baixa_estimada) === 1 ? " (estimada)" : ""} · {rotuloMeioBaixa(p.baixa_meio)}</div>
              <EtapasPedido p={p} />
            </li>
          ))}
        </ul>
      )}

      {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

      {!carregando && (
        <div className="space-y-4">
          {perm.solicitar && !aberto && contaPaga && (
            <form className="space-y-2" onSubmit={(e) => {
              e.preventDefault();
              if (!motivo.trim()) return setErro("Informe o motivo do estorno.");
              return agir(() => solicitarEstornoBaixa(conta.id, motivo.trim()), "Estorno de baixa solicitado.");
            }}>
              <label className="ui-field">
                <span className="ui-field__label">Motivo do estorno da baixa</span>
                <textarea className="ui-input min-h-20" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </label>
              <div className="flex justify-end"><Button type="submit" disabled={enviando}>Solicitar estorno da baixa</Button></div>
            </form>
          )}

          {perm.aprovar && aberto?.status === "solicitada" && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">
                {proprioPedido ? "Você solicitou este estorno e não pode aprová-lo." : "Confira o motivo e aprove no sistema."}
              </span>
              <Button disabled={enviando || proprioPedido} onClick={() => agir(() => aprovarEstornoBaixa(aberto.id), "Estorno aprovado.")}>Aprovar estorno</Button>
            </div>
          )}

          {podeRegistrar && (
            <form noValidate className="space-y-2 rounded border border-gray-200 p-3" onSubmit={enviarExterna} aria-label="Registrar autorização externa">
              <div className="font-semibold text-sm">Registrar autorização recebida por WhatsApp ou e-mail</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select label="Quem autorizou" value={externa.autorizador_id} onChange={(e) => setExterna({ ...externa, autorizador_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {autorizadores.filter((a) => !mesmaConta(a.id, aberto?.solicitado_por)).map((a) => (
                    <option key={a.id} value={a.id}>{a.nome} ({getRoleLabel(a.papel)})</option>
                  ))}
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
            <form noValidate className="space-y-3" aria-label="Executar estorno da baixa" onSubmit={(e) => {
              e.preventDefault();
              if (!confirmado) return setErro("Confirme que a conta deve voltar a pendente.");
              return agir(async () => {
        const r = await executarEstornoBaixa(aberto.id);
        setConta((atual) => ({ ...atual, ...(r?.conta || { status: "pendente", data_baixa: null, baixa_meio: null }) }));
        return r;
      }, "Baixa estornada: a conta voltou a pendente.");
            }}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
                Confirmo que a conta deve voltar a pendente e sair do realizado
              </label>
              {bloqueioTresContas && <p className="text-sm text-amber-700">Esta unidade exige três contas distintas: quem solicitou ou autorizou não executa.</p>}
              <div className="flex justify-end">
                <Button type="submit" variant="danger" disabled={enviando || bloqueioTresContas}>{enviando ? "Executando..." : "Executar estorno da baixa"}</Button>
              </div>
            </form>
          )}

          {aberto && !((perm.aprovar || perm.registrar) && aberto.status === "solicitada") && !(perm.executar && aberto.status === "aprovada") && (
            <p className="text-sm text-gray-500">
              {aberto.status === "solicitada" ? "Aguardando autorização do admin ou do dono." : "Autorizado. Aguardando execução."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function EstornoBaixaModal({ conta, onClose, onChanged }) {
  return (
    <Modal title={`Estorno da baixa: ${conta.descricao}`} onClose={onClose} className="max-w-2xl">
      <EstornoBaixaPainel conta={conta} onChanged={onChanged} />
    </Modal>
  );
}

