import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PillButton from "../../components/ui/PillButton";
import Table from "../../components/ui/Table";
import useAuth from "../../hooks/useAuth";
import {
  EstornoBadge,
  EstornoVendaModal,
  mensagemRecusaEstorno,
  origemAutorizacao,
  usePermissoesEstorno,
} from "../../components/vendas/EstornoVenda";
import { fetchEstornosVenda, fetchPoliticaEstornoVenda, salvarPoliticaEstornoVenda } from "../../services/vendaProdutoService";

// Fila de estornos de venda da unidade (L04). Mostra estado, origem da
// autorizacao e quem atuou; as acoes ficam no detalhe, conforme o papel. O
// dono configura se a unidade exige tres contas distintas.
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

export default function EstornosVendaPage() {
  const { currentUnit } = useAuth();
  const perm = usePermissoesEstorno();
  const [filtro, setFiltro] = useState(FILTROS[0].key);
  const [pedidos, setPedidos] = useState([]);
  const [politica, setPolitica] = useState(null);
  const [salvandoPolitica, setSalvandoPolitica] = useState(false);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(null);

  async function carregar() {
    setErro("");
    try {
      setPedidos(await fetchEstornosVenda(filtro ? { status: filtro } : {}));
    } catch (error) {
      setErro(mensagemRecusaEstorno(error));
      setPedidos([]);
    }
  }

  useEffect(() => {
    carregar();
  }, [filtro, currentUnit?.id]);

  useEffect(() => {
    if (!perm.algum) return;
    fetchPoliticaEstornoVenda().then(setPolitica).catch(() => setPolitica(null));
  }, [currentUnit?.id, perm.algum]);

  async function alternarPolitica(valor) {
    setSalvandoPolitica(true);
    try {
      setPolitica(await salvarPoliticaEstornoVenda(valor));
      toast.success(valor ? "A unidade passa a exigir três contas distintas." : "A unidade volta ao fluxo padrão.");
    } catch (error) {
      toast.error(mensagemRecusaEstorno(error));
    } finally {
      setSalvandoPolitica(false);
    }
  }

  if (!perm.algum) {
    return <EmptyState title="Seu papel não participa do fluxo de estorno de vendas." />;
  }

  return (
    <Card>
      <div className="entity-toolbar">
        <div className="entity-toolbar__intro">
          <span className="entity-toolbar__eyebrow">Vendas</span>
          <div>
            <h2 className="ui-section-title">Estornos de venda</h2>
            <p className="ui-section-subtitle">
              Quem atende solicita com motivo. O gestor aprova no sistema ou autoriza por WhatsApp ou e-mail, e um operador
              registra essa autorização. Com a autorização válida, quem tem a permissão na unidade executa. Quem solicitou não autoriza.
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        {politica && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2 text-sm" data-testid="politica-estorno">
            <span>
              {politica.contas_distintas
                ? "Esta unidade exige três contas distintas: solicitante, autorizador e executor."
                : "Fluxo padrão: a mesma conta pode solicitar, registrar a autorização de outro gestor e executar."}
            </span>
            {perm.dono && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={politica.contas_distintas}
                  disabled={salvandoPolitica}
                  onChange={(e) => alternarPolitica(e.target.checked)}
                />
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
        {pedidos.length === 0 ? (
          <EmptyState title="Nenhum pedido de estorno neste filtro." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Venda</th>
                <th>Produto</th>
                <th>Qtd.</th>
                <th>Valor</th>
                <th>Motivo</th>
                <th>Solicitante</th>
                <th>Autorização</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td>#{p.id}</td>
                  <td>#{p.venda_id}</td>
                  <td className="font-semibold">{p.produto_nome}</td>
                  <td>{p.quantidade_vendida}</td>
                  <td>{formatarMoeda(p.valor_estornado)}</td>
                  <td>{p.motivo}</td>
                  <td>{p.solicitado_por_nome || p.solicitado_por}</td>
                  <td>
                    {origemAutorizacao(p) ? (
                      <span>
                        {origemAutorizacao(p)}: {p.aprovado_por_nome || p.aprovado_por}
                        {p.autorizacao_registrada_por && (
                          <span className="block text-xs text-gray-500">
                            registrada por {p.autorizacao_registrada_por_nome || p.autorizacao_registrada_por}
                          </span>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                  <td><EstornoBadge status={p.status} /></td>
                  <td>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setAberto({
                        id: p.venda_id,
                        produto_id: p.produto_id,
                        produto_nome: p.produto_nome,
                        quantidade: p.quantidade,
                        valor_total: p.valor_total,
                      })}
                    >
                      Abrir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      {aberto && <EstornoVendaModal venda={aberto} onClose={() => setAberto(null)} onChanged={carregar} />}
    </Card>
  );
}
