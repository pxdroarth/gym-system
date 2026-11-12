import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import Table from "../../components/ui/Table";
import useAuth from "../../hooks/useAuth";
import { api } from "../../services/Api";
import { fetchPlanos } from "../../services/planoService";
import getApiErrorMessage from "../../utils/getApiErrorMessage";
import { ROLES, UI_PERMISSIONS, userHasUiPermission } from "../../utils/permissions";
import ModalPlanoForm from "./ModalPlanoForm";

function PoliticaRetorno({ unidade }) {
  const [politica, setPolitica] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativa = true;
    api.get("/units/politica-retorno")
      .then(({ data }) => { if (ativa) setPolitica(data.politica); })
      .catch((error) => { if (ativa) toast.error(getApiErrorMessage(error)); });
    return () => { ativa = false; };
  }, []);

  async function salvar(event) {
    event.preventDefault();
    setSalvando(true);
    try {
      await api.patch("/units/politica-retorno", { politica });
      toast.success("Política salva para a unidade.");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card>
      <form onSubmit={salvar} className="flex flex-wrap items-end gap-3">
        <label className="ui-field">
          <span className="ui-field__label">Cobrança no retorno · {unidade.nome}</span>
          <select className="ui-input" value={politica} disabled={!politica || salvando}
            onChange={(event) => setPolitica(event.target.value)}>
            <option value="" disabled>Carregando…</option>
            <option value="proporcional">Proporcional aos dias restantes</option>
            <option value="integral">Ciclo integral</option>
          </select>
        </label>
        <Button type="submit" disabled={!politica || salvando}>Salvar política</Button>
      </form>
    </Card>
  );
}

export default function PlanosPage() {
  const { user, currentUnit } = useAuth();
  const [planos, setPlanos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [planoEditar, setPlanoEditar] = useState(null);
  const canManagePlanos = userHasUiPermission(user, UI_PERMISSIONS.PLANOS_GERENCIAR);

  useEffect(() => {
    carregarPlanos();
  }, []);

  async function carregarPlanos() {
    setCarregando(true);
    try {
      const data = await fetchPlanos();
      setPlanos(data);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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
        actions={canManagePlanos ? <Button onClick={abrirModalNovo}>+ Novo Plano</Button> : null}
      />

      {user?.papel === ROLES.OWNER && currentUnit && (
        <PoliticaRetorno key={currentUnit.id} unidade={currentUnit} />
      )}
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
                {canManagePlanos ? <th>Ações</th> : null}
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
                  {canManagePlanos ? (
                    <td>
                      <Button size="sm" variant="secondary" onClick={() => abrirModalEdicao(plano)}>
                        Editar
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {canManagePlanos ? (
        <ModalPlanoForm
          open={mostrarModal}
          onClose={fecharModal}
          planoEdicao={planoEditar}
          onSalvar={async () => {
            await carregarPlanos();
            fecharModal();
          }}
        />
      ) : null}
    </div>
  );
}
