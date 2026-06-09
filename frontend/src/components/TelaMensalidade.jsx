import React, { useState } from "react";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card from "./ui/Card";
import EmptyState from "./ui/EmptyState";
import Table from "./ui/Table";
import { updateMensalidadeStatus } from "../services/mensalidadeService";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";

// LEGADO: nao reutilizar para pagamento/cobertura; fluxo canonico e POST /pagamentos ou contratacao/renovacao assistida.
function formatValor(valor) {
  const num = Number(valor);
  return Number.isNaN(num) ? "R$ 0,00" : num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusBadge(status) {
  if (status === "paga" || status === "pago") return <Badge tone="green">Pago</Badge>;
  if (status === "pendente" || status === "em_aberto") return <Badge tone="amber">{status}</Badge>;
  return <Badge tone="red">{status || "Em aberto"}</Badge>;
}

export default function TelaMensalidade({ mensalidades, atualizarMensalidades }) {
  const [loadingId, setLoadingId] = useState(null);

  async function registrarPagamento(id) {
    const confirmado = window.confirm("Confirmar pagamento desta mensalidade?");
    if (!confirmado) return;

    try {
      setLoadingId(id);
      await updateMensalidadeStatus(id, "paga");

      if (typeof atualizarMensalidades === "function") {
        await atualizarMensalidades();
      }
    } catch (error) {
      alert(getApiErrorMessage(error));
    } finally {
      setLoadingId(null);
    }
  }

  if (!mensalidades || mensalidades.length === 0) {
    return <EmptyState title="Nenhuma mensalidade encontrada." />;
  }

  return (
    <Card>
      <div className="ui-section-header">
        <div>
          <h3 className="ui-section-title">Mensalidades</h3>
          <p className="ui-section-subtitle">Histórico de cobranças e pagamentos.</p>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Vencimento</th>
            <th>Valor Cobrado</th>
            <th>Desconto</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {mensalidades.map(({ id, vencimento, valor_cobrado, desconto_aplicado, status }) => (
            <tr key={id}>
              <td>{new Date(vencimento).toLocaleDateString("pt-BR")}</td>
              <td>{formatValor(valor_cobrado)}</td>
              <td>{formatValor(desconto_aplicado)}</td>
              <td>{statusBadge(status)}</td>
              <td>
                {status !== "paga" && status !== "pago" ? (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={() => registrarPagamento(id)}
                    disabled={loadingId === id}
                  >
                    {loadingId === id ? "Processando..." : "Registrar Pagamento"}
                  </Button>
                ) : (
                  <Badge tone="green">Pago</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
