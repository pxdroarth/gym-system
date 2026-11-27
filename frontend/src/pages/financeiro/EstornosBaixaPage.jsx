import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PillButton from "../../components/ui/PillButton";
import Table from "../../components/ui/Table";
import useAuth from "../../hooks/useAuth";
import { EstornoBadge, origemAutorizacao } from "../../components/vendas/EstornoVenda";
import {
  EstornoBaixaModal,
  formatarData,
  mensagemEstornoBaixa,
  rotuloMeioBaixa,
  usePermissoesEstornoBaixa,
} from "../../components/financeiro/EstornoBaixaConta";
import { fetchEstornosBaixa, fetchPoliticaEstornoBaixa, salvarPoliticaEstornoBaixa } from "../../services/contasFinanceiras";

// Fila de estornos de baixa de conta da unidade (L04, sublote C).
const FILTROS = [
  { key: "solicitada,aprovada", label: "Pendentes" },
  { key: "solicitada", label: "Aguardando autorização" },
  { key: "aprovada", label: "Aguardando execução" },
  { key: "executada,encerrada", label: "Concluídos" },
  { key: "", label: "Todos" },
];

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EstornosBaixaPage() {
  const { currentUnit } = useAuth();
  const perm = usePermissoesEstornoBaixa();
  const [filtro, setFiltro] = useState(FILTROS[0].key);
  const [pedidos, setPedidos] = useState([]);
  const [politica, setPolitica] = useState(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);

  async function carregar() {
    setErro("");
    try {
      setPedidos(await fetchEstornosBaixa(filtro ? { status: filtro } : {}));
    } catch (error) {
      setErro(mensagemEstornoBaixa(error));
      setPedidos([]);
    }
  }
  useEffect(() => { carregar(); }, [filtro, currentUnit?.id]);
  useEffect(() => {
    if (!perm.algum) return;
    fetchPoliticaEstornoBaixa().then(setPolitica).catch(() => setPolitica(null));
  }, [currentUnit?.id, perm.algum]);

  async function alternarPolitica(valor) {
    try {
      setPolitica(await salvarPoliticaEstornoBaixa(valor));
      toast.success(valor ? "A unidade passa a exigir três contas distintas." : "A unidade volta ao fluxo padrão.");
    } catch (error) {
      toast.error(mensagemEstornoBaixa(error));
    }
  }

  if (!perm.algum) return <EmptyState title="Seu papel não participa do fluxo de estorno de baixa." />;

  return (
    <Card>
      <div className="entity-toolbar">
        <div className="entity-toolbar__intro">
          <span className="entity-toolbar__eyebrow">Contas financeiras</span>
          <div>
            <h2 className="ui-section-title">Estornos de baixa</h2>
            <p className="ui-section-subtitle">
              Financeiro, admin ou dono solicitam com motivo. Admin ou dono autoriza no sistema ou por WhatsApp ou e-mail,
              registrado por outra pessoa. Financeiro, admin ou dono executa: a conta volta a pendente.
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {politica && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2 text-sm">
            <span>
              {politica.contas_distintas
                ? "Esta unidade exige três contas distintas: solicitante, autorizador e executor."
                : "Fluxo padrão: quem solicitou não autoriza o próprio pedido."}
            </span>
            {perm.dono && (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={politica.contas_distintas} onChange={(e) => alternarPolitica(e.target.checked)} />
                Exigir três contas distintas
              </label>
            )}
          </div>
        )}
        <div className="sales-filter-bar__group">
          {FILTROS.map((f) => <PillButton key={f.label} active={filtro === f.key} onClick={() => setFiltro(f.key)}>{f.label}</PillButton>)}
        </div>
        {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {pedidos.length === 0 ? <EmptyState title="Nenhum pedido de estorno de baixa neste filtro." /> : (
          <Table>
            <thead>
              <tr><th>Pedido</th><th>Conta</th><th>Valor</th><th>Baixa</th><th>Motivo</th><th>Autorização</th><th>Estado</th><th /></tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} data-estorno-baixa-id={p.id}>
                  <td>#{p.id}</td>
                  <td className="font-semibold">{p.conta_descricao}</td>
                  <td>{formatarMoeda(p.valor)}</td>
                  <td>{formatarData(p.data_baixa)}{Number(p.data_baixa_estimada) === 1 ? " (estimada)" : ""}<span className="block text-xs text-gray-500">{rotuloMeioBaixa(p.baixa_meio)}</span></td>
                  <td>{p.motivo}</td>
                  <td>{origemAutorizacao(p) ? `${origemAutorizacao(p)}: ${p.aprovado_por_nome || p.aprovado_por}` : "—"}</td>
                  <td><EstornoBadge status={p.status} /></td>
                  <td>
                    <Button size="sm" variant="secondary" onClick={() => setAberto({
                      id: p.conta_id, descricao: p.conta_descricao, valor: p.valor, data_lancamento: p.conta_data,
                      status: p.conta_status, data_baixa: p.data_baixa, data_baixa_estimada: p.data_baixa_estimada, baixa_meio: p.baixa_meio,
                    })}>Abrir</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {aberto && <EstornoBaixaModal conta={aberto} onClose={() => setAberto(null)} onChanged={carregar} />}
    </Card>
  );
}
