import React from "react";
import Badge from "./ui/Badge";
import Card from "./ui/Card";
import EmptyState from "./ui/EmptyState";
import Table from "./ui/Table";

function badgeResultado(resultado) {
  const permitido = resultado === "liberado" || resultado === "permitido";
  return <Badge tone={permitido ? "green" : "red"}>{permitido ? "Permitido" : "Negado"}</Badge>;
}

export default function TelaAcesso({ acessos }) {
  if (!acessos || acessos.length === 0) {
    return <EmptyState title="Nenhum acesso encontrado." />;
  }

  const acessosOrdenados = [...acessos].sort(
    (a, b) => new Date(b.data_hora) - new Date(a.data_hora)
  );

  return (
    <Card>
      <div className="ui-section-header">
        <div>
          <h3 className="ui-section-title">Histórico de Acessos</h3>
          <p className="ui-section-subtitle">Tentativas mais recentes primeiro.</p>
        </div>
      </div>
      <Table>
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          {acessosOrdenados.map(({ id, data_hora, resultado }) => (
            <tr key={id}>
              <td>
                {new Date(data_hora).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </td>
              <td>{badgeResultado(resultado)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
