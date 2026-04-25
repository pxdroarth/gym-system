import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import Table from "../../components/ui/Table";
import { fetchPlanos } from "../../services/Api";
import ModalPlanoForm from "./ModalPlanoForm";

export default function PlanosPage() {
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [planoEditar, setPlanoEditar] = useState(null);

  useEffect(() => {
    carregarPlanos();
  }, []);

  async function carregarPlanos() {
    setCarregando(true);
    try {
      const data = await fetchPlanos();
      setPlanos(data);
    } catch (err) {
      toast.error("Erro ao carregar planos");
    } finally {
      setCarregando(false);
    }
  }

  function abrirModalNovo() {
    setPlanoEditar(null);
    setMostrarModal(true);
  }

  function abrirModalEdicao(plano) {
    setPlanoEditar(plano);
    setMostrarModal(true);
  }

  function fecharModal() {
    setMostrarModal(false);
    setPlanoEditar(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planos"
        subtitle="Configure valores, duração e capacidade dos planos da academia."
        actions={<Button onClick={abrirModalNovo}>+ Novo Plano</Button>}
      />

      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Planos Cadastrados</h2>
            <p className="ui-section-subtitle">{planos.length} plano(s) disponível(is).</p>
          </div>
        </div>

        {carregando ? (
          <EmptyState title="Carregando planos..." />
        ) : planos.length === 0 ? (
          <EmptyState title="Nenhum plano cadastrado." />
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Duração</th>
                <th>Capacidade</th>
                <th>Tipo</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((plano) => (
                <tr key={plano.id}>
                  <td className="font-semibold">{plano.nome}</td>
                  <td>{plano.descricao || "-"}</td>
                  <td>
                    {Number(plano.valor_base || 0).toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </td>
                  <td>{plano.duracao_em_dias} dias</td>
                  <td>{plano.quantidade_max_pessoas || 1} pessoa(s)</td>
                  <td>
                    {plano.compartilhado ? (
                      <Badge tone="blue">Compartilhado</Badge>
                    ) : (
                      <Badge tone="gray">Individual</Badge>
                    )}
                  </td>
                  <td>
                    <Button size="sm" variant="secondary" onClick={() => abrirModalEdicao(plano)}>
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ModalPlanoForm
        open={mostrarModal}
        onClose={fecharModal}
        planoEdicao={planoEditar}
        onSalvar={async () => {
          await carregarPlanos();
          fecharModal();
        }}
      />
    </div>
  );
}
