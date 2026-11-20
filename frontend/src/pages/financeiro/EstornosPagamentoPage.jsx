import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PillButton from "../../components/ui/PillButton";
import Table from "../../components/ui/Table";
import useAuth from "../../hooks/useAuth";
import { EstornoBadge, mensagemRecusaEstorno, origemAutorizacao } from "../../components/vendas/EstornoVenda";
import {
  EstornoPagamentoModal,
  rotuloMeioPagamento,
  usePermissoesEstornoPagamento,
} from "../../components/pagamentos/EstornoPagamento";
import { fetchEstornosPagamento, fetchPoliticaEstornoPagamento, salvarPoliticaEstornoPagamento } from "../../services/pagamentoService";

// Fila de estornos de pagamento do aluno da unidade (L04, sublote A). As
// acoes ficam no detalhe, conforme o papel; o dono configura a opcao de tres
// contas distintas.
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

export default function EstornosPagamentoPage() {
  const { currentUnit } = useAuth();
  const perm = usePermissoesEstornoPagamento();
  const [filtro, setFiltro] = useState(FILTROS[0].key);
  const [pedidos, setPedidos] = useState([]);
  const [politica, setPolitica] = useState(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);

  async function carregar() {
    setErro("");
    try {
      setPedidos(await fetchEstornosPagamento(filtro ? { status: filtro } : {}));
    } catch (error) {
      setErro(mensagemRecusaEstorno(error));
      setPedidos([]);
    }
  }

  useEffect(() => { carregar(); }, [filtro, currentUnit?.id]);
  useEffect(() => {
    if (!perm.algum) return;
    fetchPoliticaEstornoPagamento().then(setPolitica).catch(() => setPolitica(null));
  }, [currentUnit?.id, perm.algum]);

  async function alternarPolitica(valor) {
    try {
      setPolitica(await salvarPoliticaEstornoPagamento(valor));
      toast.success(valor ? "A unidade passa a exigir três contas distintas." : "A unidade volta ao fluxo padrão.");
    } catch (error) {
      toast.error(mensagemRecusaEstorno(error));
    }
  }

  if (!perm.algum) return <EmptyState title="Seu papel não participa do fluxo de estorno de pagamentos." />;

  return (
    <Card>
      <div className="entity-toolbar">
        <div className="entity-toolbar__intro">
          <span className="entity-toolbar__eyebrow">Mensalidades</span>
          <div>
            <h2 className="ui-section-title">Estornos de pagamento</h2>
            <p className="ui-section-subtitle">
              Recepção, gestor ou Financeiro solicitam com motivo. Dono ou admin autoriza no sistema ou por WhatsApp ou e-mail,
              registrado por outra pessoa. Financeiro, admin ou dono executa e confirma a devolução ao aluno.
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
          {FILTROS.map((f) => (
            <PillButton key={f.label} active={filtro === f.key} onClick={() => setFiltro(f.key)}>{f.label}</PillButton>
          ))}
        </div>
        {erro && <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {pedidos.length === 0 ? <EmptyState title="Nenhum pedido de estorno neste filtro." /> : (
          <Table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Aluno</th>
                <th>Pagamento</th>
                <th>Valor</th>
                <th>Meio</th>
                <th>Motivo</th>
                <th>Autorização</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} data-estorno-id={p.id}>
                  <td>#{p.id}</td>
                  <td className="font-semibold">{p.aluno_nome || `Aluno #${p.aluno_id}`}</td>
                  <td>#{p.pagamento_id}</td>
                  <td>{formatarMoeda(p.valor_estornado)}</td>
                  <td>
                    {rotuloMeioPagamento(p.meio_original)}
                    {p.devolucoes?.length > 0 && (
                      <span className="block text-xs text-gray-500">devolvido: {p.devolucoes.map((d) => d.rotulo).join(" · ")}</span>
                    )}
                  </td>
                  <td>{p.motivo}</td>
                  <td>
                    {origemAutorizacao(p) ? (
                      <span>
                        {origemAutorizacao(p)}: {p.aprovado_por_nome || p.aprovado_por}
                        {p.autorizacao_registrada_por && (
                          <span className="block text-xs text-gray-500">registrada por {p.autorizacao_registrada_por_nome || p.autorizacao_registrada_por}</span>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                  <td><EstornoBadge status={p.status} /></td>
                  <td>
                    <Button size="sm" variant="secondary" onClick={() => setAberto({
                      id: p.pagamento_id,
                      valor_pago: p.valor_pago,
                      data_pagamento: p.data_pagamento,
                      forma_pagamento: p.forma_pagamento,
                    })}>Abrir</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {aberto && <EstornoPagamentoModal pagamento={aberto} onClose={() => setAberto(null)} onChanged={carregar} />}
    </Card>
  );
}
