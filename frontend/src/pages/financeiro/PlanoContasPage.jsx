import React, { useEffect, useMemo, useState } from "react";
import {
  createPlanoConta,
  deletePlanoConta,
  getPlanoContas,
  updatePlanoConta,
} from "../../services/planoContasService";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Select from "../../components/ui/Select";
import Table from "../../components/ui/Table";

function tipoBadge(tipo) {
  return tipo === "receita"
    ? <Badge tone="green">Receita</Badge>
    : <Badge tone="red">Despesa</Badge>;
}

export default function PlanoContasPage() {
  const [contas, setContas] = useState([]);
  const [modalAberto, setModalAberto] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    tipo: "despesa",
    descricao: "",
    quantidade_sugerida: "",
    dia_sugerido: "",
  });
  const [editandoId, setEditandoId] = useState(null);
  const [erro, setErro] = useState(null);

  const carregarContas = async () => {
    try {
      const data = await getPlanoContas();
      setContas(data);
    } catch (error) {
      setErro("Erro ao carregar contas");
    }
  };

  useEffect(() => {
    carregarContas();
  }, []);

  const abrirModal = (conta = null) => {
    setErro(null);
    if (conta) {
      setEditandoId(conta.id);
      setForm({
        nome: conta.nome,
        tipo: conta.tipo,
        descricao: conta.descricao || "",
        quantidade_sugerida: conta.quantidade_sugerida || "",
        dia_sugerido: conta.dia_sugerido || "",
      });
    } else {
      setEditandoId(null);
      setForm({ nome: "", tipo: "despesa", descricao: "", quantidade_sugerida: "", dia_sugerido: "" });
    }
    setModalAberto(true);
  };

  const fecharModal = () => {
    setModalAberto(false);
  };

  const salvar = async () => {
    if (!form.nome || !form.tipo) {
      setErro("Nome e tipo são obrigatórios");
      return;
    }

    try {
      if (editandoId) {
        await updatePlanoConta(editandoId, form);
      } else {
        await createPlanoConta(form);
      }
      fecharModal();
      carregarContas();
    } catch (error) {
      setErro("Erro ao salvar conta");
    }
  };

  const remover = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir?")) return;
    try {
      await deletePlanoConta(id);
      carregarContas();
    } catch (error) {
      alert("Erro ao excluir");
    }
  };

  const resumo = useMemo(() => ({
    receitas: contas.filter((conta) => conta.tipo === "receita").length,
    despesas: contas.filter((conta) => conta.tipo === "despesa").length,
  }), [contas]);

  return (
    <div className="space-y-6">
      <Card className="finance-filter-card">
        <div className="entity-toolbar">
          <div className="entity-toolbar__intro">
            <span className="entity-toolbar__eyebrow">Estrutura financeira</span>
            <div>
              <h2 className="ui-section-title">Plano de contas</h2>
              <p className="ui-section-subtitle">Categorias financeiras usadas para organizar receitas e despesas da unidade.</p>
            </div>
          </div>
          <Button onClick={() => abrirModal()}>+ Nova Conta</Button>
        </div>

        <div className="p-5 space-y-5">
          <div className="entity-summary-grid">
            <div className="finance-glass-card">
              <div className="finance-glass-card__label">Categorias</div>
              <div className="finance-glass-card__value">{contas.length}</div>
              <div className="finance-glass-card__copy">Estrutura de classificação disponível no tenant/unidade atual.</div>
            </div>
            <div className="finance-glass-card">
              <div className="finance-glass-card__label">Receitas</div>
              <div className="finance-glass-card__value">{resumo.receitas}</div>
              <div className="finance-glass-card__copy">Categorias voltadas para entradas financeiras.</div>
            </div>
            <div className="finance-glass-card">
              <div className="finance-glass-card__label">Despesas</div>
              <div className="finance-glass-card__value">{resumo.despesas}</div>
              <div className="finance-glass-card__copy">Categorias voltadas para saídas e custo operacional.</div>
            </div>
          </div>

          {erro && !modalAberto ? (
            <EmptyState title={erro} />
          ) : contas.length === 0 ? (
            <EmptyState title="Nenhuma conta cadastrada." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Descrição</th>
                  <th>Qtde Sug.</th>
                  <th>Dia Sug.</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {contas.map((conta) => (
                  <tr key={conta.id}>
                    <td className="font-semibold">{conta.nome}</td>
                    <td>{tipoBadge(conta.tipo)}</td>
                    <td>{conta.descricao || "-"}</td>
                    <td>{conta.quantidade_sugerida || "-"}</td>
                    <td>{conta.dia_sugerido || "-"}</td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="secondary" onClick={() => abrirModal(conta)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remover(conta.id)}>
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </Card>

      {modalAberto && (
        <Modal title={`${editandoId ? "Editar" : "Nova"} Conta`} onClose={fecharModal} className="max-w-4xl">
          {erro && <p className="text-red-700 font-semibold mb-3">{erro}</p>}

          <div className="finance-modal-grid">
            <div className="finance-modal-panel">
              <h3 className="finance-modal-panel__title">Dados da categoria</h3>
              <p className="finance-modal-panel__copy">A estrutura visual ficou mais madura, mas o fluxo de salvar continua exatamente o mesmo.</p>

              <div className="grid grid-cols-1 gap-3 mt-4">
                <Input
                  label="Nome"
                  type="text"
                  placeholder="Nome"
                  value={form.nome}
                  onChange={(event) => setForm({ ...form, nome: event.target.value })}
                />
                <Select label="Tipo" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </Select>
                <label className="ui-field">
                  <span className="ui-field__label">Descrição</span>
                  <textarea
                    placeholder="Descrição"
                    className="ui-input min-h-24"
                    value={form.descricao}
                    onChange={(event) => setForm({ ...form, descricao: event.target.value })}
                  />
                </label>
                <Input
                  label="Quantidade sugerida"
                  type="number"
                  placeholder="Opcional"
                  value={form.quantidade_sugerida}
                  onChange={(event) => setForm({ ...form, quantidade_sugerida: event.target.value })}
                />
                <Input
                  label="Dia sugerido"
                  type="number"
                  placeholder="1-31, opcional"
                  value={form.dia_sugerido}
                  onChange={(event) => setForm({ ...form, dia_sugerido: event.target.value })}
                />
              </div>
            </div>

            <div className="finance-modal-panel">
              <h3 className="finance-modal-panel__title">Leitura rápida</h3>
              <p className="finance-modal-panel__copy">Apoio visual para manter padronização, governança e consistência nas categorias.</p>

              <div className="finance-list mt-4">
                <div className="finance-list__item">
                  <div>
                    <div className="finance-list__title">Tipo da conta</div>
                    <div className="finance-list__copy">Receita ou despesa, sem alterar a semântica do backend.</div>
                  </div>
                  <div className="finance-list__value">{form.tipo}</div>
                </div>
                <div className="finance-list__item">
                  <div>
                    <div className="finance-list__title">Dia sugerido</div>
                    <div className="finance-list__copy">Campo opcional para apoio operacional.</div>
                  </div>
                  <div className="finance-list__value">{form.dia_sugerido || "-"}</div>
                </div>
                <div className="finance-list__item">
                  <div>
                    <div className="finance-list__title">Quantidade sugerida</div>
                    <div className="finance-list__copy">Mantida como metadado de apoio visual.</div>
                  </div>
                  <div className="finance-list__value">{form.quantidade_sugerida || "-"}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={fecharModal}>Cancelar</Button>
            <Button onClick={salvar}>Salvar</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
