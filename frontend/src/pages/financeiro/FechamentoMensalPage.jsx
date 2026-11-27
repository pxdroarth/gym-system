import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import Input from "../../components/ui/Input";
import Select from "../../components/ui/Select";
import useAuth from "../../hooks/useAuth";
import { UI_PERMISSIONS, getRoleLabel, userHasUiPermission } from "../../utils/permissions";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { fecharMes, fetchFechamentoMes, fetchResponsaveisFechamento, reabrirMes } from "../../services/fechamentoService";

// Fechamento mensal com conferencia por meio e ressalva (L04, sublote D;
// decisao 6 de 16/11/2026). Divergencia sem explicacao bloqueia o fechamento;
// dono ou admin pode fechar com ressalva (motivo, evidencia, valor e
// responsavel). Somente o dono reabre, com motivo.

const STATUS = {
  aberto: { label: "Aberto", tone: "gray" },
  fechado: { label: "Fechado", tone: "green" },
  fechado_com_inconsistencias: { label: "Fechado com ressalva", tone: "amber" },
  reaberto: { label: "Reaberto", tone: "blue" },
};
const TIPOS = {
  mensalidade_sem_lancamento_financeiro: "Mensalidade paga sem lançamento financeiro",
  venda_sem_entrada_financeira: "Venda sem entrada no financeiro",
  lancamento_financeiro_orfao: "Lançamento sem registro de origem",
  venda_com_produto_orfao: "Venda de produto inexistente",
};

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function mesAtual() {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return d.slice(0, 7);
}
function formatarHorario(valor) {
  if (!valor) return "-";
  const d = new Date(String(valor).includes("T") ? valor : `${String(valor).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? String(valor) : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function FechamentoMensalPage() {
  const { user, currentUnit } = useAuth();
  const podeFechar = userHasUiPermission(user, UI_PERMISSIONS.FECHAMENTO_FECHAR);
  const podeReabrir = userHasUiPermission(user, UI_PERMISSIONS.FECHAMENTO_REABRIR);
  const [periodo, setPeriodo] = useState(mesAtual());
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [responsaveis, setResponsaveis] = useState([]);
  const [ressalva, setRessalva] = useState({ motivo: "", evidencia: "", valor: "", responsavel_id: "" });
  const [motivoReabertura, setMotivoReabertura] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ano, mes] = periodo.split("-").map(Number);
  // Troca rapida de mes: so a resposta do pedido mais recente atualiza a tela.
  const ultimoPedido = useRef(0);

  async function carregar() {
    const pedido = ++ultimoPedido.current;
    setErro("");
    setDados(null);
    try {
      const resposta = await fetchFechamentoMes(ano, mes);
      if (pedido === ultimoPedido.current) setDados(resposta);
    } catch (error) {
      if (pedido !== ultimoPedido.current) return;
      setErro(getApiErrorMessage(error));
      setDados(null);
    }
  }
  useEffect(() => { if (ano && mes) carregar(); }, [periodo, currentUnit?.id]);
  useEffect(() => {
    if (!podeFechar) return;
    fetchResponsaveisFechamento().then(setResponsaveis).catch(() => setResponsaveis([]));
  }, [podeFechar, currentUnit?.id]);

  const fechamento = dados?.fechamento;
  const analise = dados?.analise;
  const status = fechamento?.status || "aberto";
  const fechado = ["fechado", "fechado_com_inconsistencias"].includes(status);
  const divergencias = analise?.inconsistencias || [];
  const conf = analise?.conferencia;
  const semMeio = conf?.sem_meio_registrado;
  const totalSemMeio = useMemo(() => (semMeio
    ? semMeio.vendas.quantidade + semMeio.mensalidades.quantidade + semMeio.contas.quantidade : 0), [semMeio]);

  async function agir(acao, sucesso) {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await acao();
      toast.success(sucesso);
      setRessalva({ motivo: "", evidencia: "", valor: "", responsavel_id: "" });
      setMotivoReabertura("");
      await carregar();
    } catch (error) {
      const mensagem = getApiErrorMessage(error);
      setErro(mensagem);
      toast.error(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  function fecharComRessalva(event) {
    event.preventDefault();
    if (ressalva.motivo.trim().length < 3) return setErro("Informe o motivo da ressalva.");
    if (ressalva.evidencia.trim().length < 3) return setErro("Informe a evidência (documento, chamado ou comprovante).");
    if (!ressalva.responsavel_id) return setErro("Informe o responsável pelo acompanhamento.");
    const valor = ressalva.valor === "" ? null : Number(String(ressalva.valor).replace(",", "."));
    return agir(() => fecharMes(ano, mes, {
      ressalva: {
        motivo: ressalva.motivo.trim(),
        evidencia: ressalva.evidencia.trim(),
        valor,
        responsavel_id: Number(ressalva.responsavel_id),
      },
    }), "Mês fechado com ressalva.");
  }

  return (
    <Card>
      <div className="entity-toolbar">
        <div className="entity-toolbar__intro">
          <span className="entity-toolbar__eyebrow">Conciliação</span>
          <div>
            <h2 className="ui-section-title">Fechamento mensal</h2>
            <p className="ui-section-subtitle">
              Confira o que entrou e saiu por meio de pagamento. Divergência sem explicação bloqueia o fechamento; dono ou admin
              pode fechar com ressalva, registrando motivo, evidência e responsável. Só o dono reabre.
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <Input label="Mês" type="month" value={periodo} onChange={(e) => e.target.value && setPeriodo(e.target.value)} />
          <div className="pb-2" data-testid="status-fechamento" data-periodo={dados ? `${analise?.ano}-${String(analise?.mes).padStart(2, "0")}` : ""}>
            {dados ? <Badge tone={STATUS[status]?.tone || "gray"}>{STATUS[status]?.label || status}</Badge> : <span className="text-sm text-gray-500">Carregando…</span>}
          </div>
          {fechamento?.fechado_em && fechado && (
            <span className="pb-2 text-sm text-gray-600">
              Fechado em {formatarHorario(fechamento.fechado_em)}{fechamento.fechado_por_nome ? ` por ${fechamento.fechado_por_nome}` : ""}
            </span>
          )}
        </div>

        {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {fechamento?.ressalva && fechado && (
          <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="ressalva-registrada">
            <div className="font-semibold">Ressalva</div>
            <div>Motivo: {fechamento.ressalva.motivo}</div>
            <div>Evidência: {fechamento.ressalva.evidencia}</div>
            {fechamento.ressalva.valor !== null && fechamento.ressalva.valor !== undefined && <div>Valor: {formatarMoeda(fechamento.ressalva.valor)}</div>}
            <div>Responsável pelo acompanhamento: {fechamento.ressalva.responsavel?.nome}</div>
            <div>Registrada por {fechamento.ressalva.registrada_por?.nome || fechamento.ressalva.registrada_por?.id} em {formatarHorario(fechamento.ressalva.registrada_em)}</div>
          </div>
        )}

        <section aria-label="Conferência por meio" className="space-y-2">
          <h3 className="font-semibold">Conferência por meio</h3>
          {!conf ? <p className="text-sm text-gray-500">Carregando…</p> : (
            <div className="ui-table-wrap">
              <table className="ui-table" aria-label="Conferência por meio do mês">
                <thead>
                  <tr><th>Meio</th><th>Vendas</th><th>Mensalidades</th><th>Contas</th><th>Entrou</th><th>Saiu</th><th>Líquido</th></tr>
                </thead>
                <tbody>
                  {conf.meios.map((m) => (
                    <tr key={m.meio} data-meio={m.meio}>
                      <td className="font-semibold">{m.rotulo}</td>
                      <td>{formatarMoeda(m.vendas_entrada)}{m.vendas_saida ? <span className="block text-xs text-gray-500">devolvido {formatarMoeda(m.vendas_saida)}</span> : null}</td>
                      <td>{formatarMoeda(m.mensalidades_entrada)}{m.mensalidades_saida ? <span className="block text-xs text-gray-500">devolvido {formatarMoeda(m.mensalidades_saida)}</span> : null}</td>
                      <td>{formatarMoeda(m.contas_entrada)}{m.contas_saida ? <span className="block text-xs text-gray-500">pago {formatarMoeda(m.contas_saida)}</span> : null}</td>
                      <td>{formatarMoeda(m.entrada)}</td>
                      <td>{formatarMoeda(m.saida)}</td>
                      <td className="font-semibold">{formatarMoeda(m.liquido)}</td>
                    </tr>
                  ))}
                  <tr data-meio="total">
                    <td className="font-semibold">Total</td><td /><td /><td />
                    <td>{formatarMoeda(conf.total.entrada)}</td>
                    <td>{formatarMoeda(conf.total.saida)}</td>
                    <td className="font-semibold">{formatarMoeda(conf.total.liquido)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {totalSemMeio > 0 && (
            <p className="text-sm text-gray-600" data-testid="sem-meio">
              Sem meio registrado (registros anteriores ao controle por meio):
              {" "}{semMeio.vendas.quantidade} venda(s) {formatarMoeda(semMeio.vendas.valor)},
              {" "}{semMeio.mensalidades.quantidade} pagamento(s) {formatarMoeda(semMeio.mensalidades.valor)},
              {" "}{semMeio.contas.quantidade} baixa(s) {formatarMoeda(semMeio.contas.valor)}.
            </p>
          )}
        </section>

        <section aria-label="Divergências" className="space-y-2">
          <h3 className="font-semibold">Divergências</h3>
          {divergencias.length === 0 ? (
            <p className="text-sm text-green-700" data-testid="sem-divergencias">Nenhuma divergência encontrada.</p>
          ) : (
            <ul className="space-y-1 text-sm" aria-label="Lista de divergências">
              {divergencias.map((d) => (
                <li key={d.chave} className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  {TIPOS[d.tipo] || d.tipo} · registro #{d.registro_id}
                </li>
              ))}
            </ul>
          )}
        </section>

        {podeFechar && !fechado && divergencias.length === 0 && (
          <div className="flex justify-end">
            <Button disabled={enviando} onClick={() => agir(() => fecharMes(ano, mes), "Mês fechado.")}>Fechar mês</Button>
          </div>
        )}

        {podeFechar && !fechado && divergencias.length > 0 && (
          <form noValidate className="space-y-3 rounded border border-amber-200 p-4" onSubmit={fecharComRessalva} aria-label="Fechar com ressalva">
            <p className="text-sm text-amber-900">
              Há divergências: o mês só fecha depois de corrigidas ou com ressalva, registrando a explicação e quem acompanha.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Motivo da ressalva" value={ressalva.motivo} maxLength={500} onChange={(e) => setRessalva({ ...ressalva, motivo: e.target.value })} />
              <Input label="Evidência (documento, chamado ou comprovante)" value={ressalva.evidencia} maxLength={500}
                onChange={(e) => setRessalva({ ...ressalva, evidencia: e.target.value })} />
              <Input label="Valor da diferença (opcional)" inputMode="decimal" value={ressalva.valor} onChange={(e) => setRessalva({ ...ressalva, valor: e.target.value })} />
              <Select label="Responsável pelo acompanhamento" value={ressalva.responsavel_id} onChange={(e) => setRessalva({ ...ressalva, responsavel_id: e.target.value })}>
                <option value="">Selecione</option>
                {responsaveis.map((r) => <option key={r.id} value={r.id}>{r.nome} ({getRoleLabel(r.papel)})</option>)}
              </Select>
            </div>
            <div className="flex justify-end"><Button type="submit" variant="danger" disabled={enviando}>Fechar com ressalva</Button></div>
          </form>
        )}

        {podeReabrir && fechado && (
          <form className="flex flex-wrap items-end gap-3" aria-label="Reabrir mês" onSubmit={(e) => {
            e.preventDefault();
            if (motivoReabertura.trim().length < 3) return setErro("Informe o motivo da reabertura.");
            return agir(() => reabrirMes(ano, mes, motivoReabertura.trim()), "Mês reaberto.");
          }}>
            <div className="min-w-64 flex-1">
              <Input label="Motivo da reabertura" value={motivoReabertura} maxLength={500} onChange={(e) => setMotivoReabertura(e.target.value)} />
            </div>
            <Button type="submit" variant="secondary" disabled={enviando}>Reabrir mês</Button>
          </form>
        )}

        {!podeFechar && !fechado && (
          <p className="text-sm text-gray-500">O fechamento é feito pelo dono ou pelo admin da unidade.</p>
        )}
      </div>
    </Card>
  );
}
