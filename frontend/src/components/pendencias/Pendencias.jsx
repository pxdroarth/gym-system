import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { AlertTriangle, Mail, MessageCircle, Phone } from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Card from "../ui/Card";
import Modal from "../ui/Modal";
import Select from "../ui/Select";
import useAuth from "../../hooks/useAuth";
import { UI_PERMISSIONS, userHasUiPermission } from "../../utils/permissions";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";
import { fetchContatosAluno, fetchPendencias, fetchResumoPendencias, registrarContatoAluno } from "../../services/Api";

// Pendencias por estorno e contato com o aluno (L04, sublote B; decisoes de
// 20/11 e 26/11/2026). Pacote com pagamento estornado mantem o acesso ate o
// fim da cobertura proporcional ao que continua pago; mensal bloqueia na hora.
// A pendencia some sozinha quando um novo pagamento quita a mensalidade.

export const CANAIS_CONTATO = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Ligação" },
  { value: "presencial", label: "Presencial" },
];
const ROTULO_CANAL = Object.fromEntries(CANAIS_CONTATO.map((c) => [c.value, c.label]));

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function formatarData(data) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(data || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "-";
}
function formatarHorario(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function usePermissoesPendencias() {
  const { user } = useAuth();
  return {
    ver: userHasUiPermission(user, UI_PERMISSIONS.PENDENCIAS_VER),
    contatar: userHasUiPermission(user, UI_PERMISSIONS.ALUNOS_CONTATO_REGISTRAR),
  };
}

// Numero para o link do WhatsApp: so digitos, com DDI 55 quando faltar.
export function linkWhatsApp(telefone, mensagem) {
  const digitos = String(telefone || "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export function textoAcesso(p) {
  if (p.acesso === "liberado_ate") return `Acesso liberado até ${formatarData(p.liberado_ate)}`;
  return "Acesso bloqueado";
}

export function textoPendencia(p) {
  const base = `Saldo em aberto de ${formatarMoeda(p.saldo_em_aberto)} após estorno de pagamento`;
  if (p.tipo === "pacote") {
    return p.meses_cobertos > 0
      ? `${base}. O pacote de ${p.meses} meses passa a cobrir ${p.meses_cobertos} ${p.meses_cobertos === 1 ? "mês" : "meses"}, até ${formatarData(p.cobertura_ate)}.`
      : `${base}. O valor pago não cobre nenhum mês do pacote.`;
  }
  return `${base}.`;
}

function mensagemContato(p, unidade) {
  return `Olá, ${String(p.aluno_nome || "").split(" ")[0]}! Aqui é da ${unidade || "academia"}. `
    + `Identificamos um saldo em aberto de ${formatarMoeda(p.saldo_em_aberto)} na sua mensalidade`
    + (p.acesso === "liberado_ate" ? `; seu acesso segue liberado até ${formatarData(p.liberado_ate)}` : "")
    + ". Podemos conversar para regularizar?";
}

// Aviso ao entrar: toast de ~10 s uma vez por sessao e unidade enquanto
// houver pendencias.
const avisosMostrados = new Set();
export function AvisoPendencias() {
  const { user, token, currentUnit } = useAuth();
  const navigate = useNavigate();
  const pode = userHasUiPermission(user, UI_PERMISSIONS.PENDENCIAS_VER);
  useEffect(() => {
    if (!pode || !user?.id || !currentUnit?.id || !token) return;
    const chave = `${user.id}:${currentUnit.id}:${String(token).slice(-16)}`;
    if (avisosMostrados.has(chave)) return;
    avisosMostrados.add(chave);
    fetchResumoPendencias().then((r) => {
      if (!r?.total) return;
      const texto = `${r.total} ${r.total === 1 ? "aluno com pendência" : "alunos com pendência"} para contatar`
        + (r.bloqueados ? ` (${r.bloqueados} com acesso bloqueado)` : "") + ".";
      toast.warn(
        <button type="button" className="text-left" data-testid="aviso-pendencias" onClick={() => navigate("/dashboard#pendencias")}>
          {texto} <span className="underline">Ver no Dashboard</span>
        </button>,
        { autoClose: 10000, toastId: `pendencias-${chave}` }
      );
    }).catch(() => {});
  }, [pode, user?.id, currentUnit?.id, token, navigate]);
  return null;
}

export function ContatarAlunoModal({ pendencia, aluno, onClose, onRegistrado }) {
  const { currentUnit } = useAuth();
  const alvo = pendencia || {
    aluno_id: aluno.id, aluno_nome: aluno.nome, telefone: aluno.telefone, email: aluno.email, saldo_em_aberto: 0,
  };
  const [canal, setCanal] = useState(alvo.telefone ? "whatsapp" : alvo.email ? "email" : "telefone");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const mensagem = mensagemContato(alvo, currentUnit?.nome);
  const whatsapp = linkWhatsApp(alvo.telefone, mensagem);
  const email = alvo.email
    ? `mailto:${alvo.email}?subject=${encodeURIComponent("Pendência na mensalidade")}&body=${encodeURIComponent(mensagem)}`
    : null;

  async function registrar(event) {
    event.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await registrarContatoAluno({
        aluno_id: alvo.aluno_id,
        mensalidade_id: pendencia?.mensalidade_id,
        canal,
        observacao: observacao.trim() || undefined,
      });
      toast.success("Contato registrado.");
      onRegistrado?.();
      onClose();
    } catch (error) {
      setErro(getApiErrorMessage(error));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal title={`Contatar ${alvo.aluno_nome}`} onClose={onClose} className="max-w-lg">
      <form className="space-y-4" onSubmit={registrar} aria-label="Registrar contato">
        {pendencia && <p className="text-sm">{textoPendencia(pendencia)} {textoAcesso(pendencia)}.</p>}
        <div className="flex flex-wrap gap-2">
          {whatsapp ? (
            <a className="ui-button ui-button--secondary ui-button--sm inline-flex items-center gap-1" href={whatsapp}
              target="_blank" rel="noopener noreferrer" onClick={() => setCanal("whatsapp")} data-testid="contato-whatsapp">
              <MessageCircle size={15} /> Abrir WhatsApp
            </a>
          ) : <span className="text-sm text-gray-500">Sem telefone para WhatsApp.</span>}
          {email ? (
            <a className="ui-button ui-button--secondary ui-button--sm inline-flex items-center gap-1" href={email}
              onClick={() => setCanal("email")} data-testid="contato-email">
              <Mail size={15} /> Enviar e-mail
            </a>
          ) : <span className="text-sm text-gray-500">Sem e-mail cadastrado.</span>}
          {alvo.telefone && (
            <a className="ui-button ui-button--ghost ui-button--sm inline-flex items-center gap-1" href={`tel:${String(alvo.telefone).replace(/[^\d+]/g, "")}`}
              onClick={() => setCanal("telefone")}>
              <Phone size={15} /> Ligar
            </a>
          )}
        </div>
        <Select label="Canal usado" value={canal} onChange={(e) => setCanal(e.target.value)}>
          {CANAIS_CONTATO.map((c) => (
            <option key={c.value} value={c.value}
              disabled={(c.value === "whatsapp" && !alvo.telefone) || (c.value === "email" && !alvo.email)}>{c.label}</option>
          ))}
        </Select>
        <label className="ui-field">
          <span className="ui-field__label">Observação (opcional)</span>
          <textarea className="ui-input min-h-20" rows={3} maxLength={500} value={observacao}
            placeholder="Ex.: aluno vai pagar na sexta" onChange={(e) => setObservacao(e.target.value)} />
        </label>
        {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        <p className="text-xs text-gray-500">Registrar o contato não encerra a pendência; ela some quando um novo pagamento quitar a mensalidade.</p>
        <div className="flex justify-end"><Button type="submit" disabled={enviando}>{enviando ? "Registrando..." : "Registrar contato"}</Button></div>
      </form>
    </Modal>
  );
}

function UltimoContato({ contato }) {
  if (!contato) return <span className="text-gray-500">Nenhum contato</span>;
  return (
    <span>
      {ROTULO_CANAL[contato.canal] || contato.canal} · {formatarHorario(contato.registrado_em)}
      <span className="block text-xs text-gray-500">{contato.registrado_por_nome || contato.registrado_por}{contato.total > 1 ? ` · ${contato.total} contatos` : ""}</span>
    </span>
  );
}

// Bloco do Dashboard.
export function PendenciasPainel() {
  const perm = usePermissoesPendencias();
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState("");
  const [contatar, setContatar] = useState(null);

  async function carregar() {
    try {
      setErro("");
      setLista(await fetchPendencias());
    } catch (error) {
      setErro(getApiErrorMessage(error));
      setLista([]);
    }
  }
  useEffect(() => { if (perm.ver) carregar(); }, [perm.ver]);
  if (!perm.ver) return null;

  return (
    <Card className="gym-panel" id="pendencias">
      <div className="gym-panel__head">
        <div>
          <h2 className="ui-section-title inline-flex items-center gap-2"><AlertTriangle size={19} /> Pendências para contatar</h2>
          <p>Mensalidades com pagamento estornado e saldo em aberto.</p>
        </div>
      </div>
      {erro && <p role="alert">{erro}</p>}
      {lista === null ? <p role="status">Carregando pendências…</p> : lista.length === 0 ? (
        <p>Nenhuma pendência por estorno.</p>
      ) : (
        <div className="ui-table-wrap">
          <table className="ui-table" aria-label="Pendências para contatar">
            <thead><tr><th>Aluno</th><th>Saldo</th><th>Acesso</th><th>Último contato</th><th /></tr></thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.mensalidade_id} data-pendencia-mensalidade={p.mensalidade_id}>
                  <td>
                    <Link to={`/alunos/${p.aluno_id}`} className="font-semibold">{p.aluno_nome}</Link>
                    <span className="block text-xs text-gray-500">{p.tipo === "pacote" ? `Pacote de ${p.meses} meses` : "Mensal"}{p.plano_nome ? ` · ${p.plano_nome}` : ""}</span>
                  </td>
                  <td>{formatarMoeda(p.saldo_em_aberto)}</td>
                  <td>
                    <Badge tone={p.acesso === "bloqueado" ? "red" : "amber"}>
                      {p.acesso === "bloqueado" ? "Bloqueado" : `Até ${formatarData(p.liberado_ate)}`}
                    </Badge>
                  </td>
                  <td><UltimoContato contato={p.ultimo_contato} /></td>
                  <td>{perm.contatar && <Button size="sm" variant="secondary" onClick={() => setContatar(p)}>Contatar aluno</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {contatar && <ContatarAlunoModal pendencia={contatar} onClose={() => setContatar(null)} onRegistrado={carregar} />}
    </Card>
  );
}

// Destaque no perfil do aluno, com o historico de contatos.
export function PendenciasAluno({ aluno, versao }) {
  const perm = usePermissoesPendencias();
  const [lista, setLista] = useState([]);
  const [contatos, setContatos] = useState([]);
  const [contatar, setContatar] = useState(null);

  async function carregar() {
    try {
      const [p, c] = await Promise.all([fetchPendencias({ aluno_id: aluno.id }), fetchContatosAluno(aluno.id)]);
      setLista(p);
      setContatos(c);
    } catch {
      setLista([]);
      setContatos([]);
    }
  }
  useEffect(() => { if (perm.ver && aluno?.id) carregar(); }, [perm.ver, aluno?.id, versao]);
  if (!perm.ver || (!lista.length && !contatos.length)) return null;

  return (
    <section className="space-y-3" aria-label="Pendências do aluno">
      {lista.map((p) => (
        <div key={p.mensalidade_id} role="status" data-testid={`pendencia-aluno-${p.mensalidade_id}`}
          className={`flex flex-wrap items-center justify-between gap-3 rounded border px-4 py-3 text-sm ${p.acesso === "bloqueado" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <span>
            <strong>Pendência:</strong> {textoPendencia(p)} {textoAcesso(p)}.
            {p.ultimo_contato && <span className="block text-xs">Último contato: {ROTULO_CANAL[p.ultimo_contato.canal]} em {formatarHorario(p.ultimo_contato.registrado_em)}</span>}
          </span>
          {perm.contatar && <Button size="sm" onClick={() => setContatar(p)}>Contatar aluno</Button>}
        </div>
      ))}
      {contatos.length > 0 && (
        <details className="rounded border border-gray-200 px-4 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Contatos registrados ({contatos.length})</summary>
          <ul className="mt-2 space-y-1" aria-label="Contatos registrados">
            {contatos.map((c) => (
              <li key={c.id}>
                {formatarHorario(c.registrado_em)} · {ROTULO_CANAL[c.canal] || c.canal} · {c.registrado_por_nome || c.registrado_por}
                {c.observacao && <span className="text-gray-600"> — {c.observacao}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {contatar && <ContatarAlunoModal pendencia={contatar} onClose={() => setContatar(null)} onRegistrado={carregar} />}
    </section>
  );
}

// Texto do teste de acesso quando ha pendencia por estorno.
export function mensagemAcessoPendencia(avaliacao) {
  const p = avaliacao?.pendencia;
  if (!p) return null;
  if (avaliacao.motivo === "cobertura_proporcional") {
    return `Acesso liberado com pendência: saldo de ${formatarMoeda(p.saldo_em_aberto)}; cobertura até ${formatarData(p.cobertura_ate)}. Contate o aluno.`;
  }
  return p.cobertura_ate
    ? `Acesso bloqueado: a cobertura proporcional terminou em ${formatarData(p.cobertura_ate)}; saldo de ${formatarMoeda(p.saldo_em_aberto)}. Contate o aluno.`
    : `Acesso bloqueado: após o estorno, o valor pago não cobre o período atual; saldo de ${formatarMoeda(p.saldo_em_aberto)}. Contate o aluno.`;
}
