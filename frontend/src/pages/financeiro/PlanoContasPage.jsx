import React, { useEffect, useState } from "react";
import {
  getPlanoContas,
  createPlanoConta,
  updatePlanoConta,
  deletePlanoConta,
} from '../../services/planoContasService';
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
    } catch (e) {
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
    } catch (e) {
      setErro("Erro ao salvar conta");
    }
  };

  const remover = async (id) => {
    if (!window.confirm("Tem certeza que deseja excluir?")) return;
    try {
      await deletePlanoConta(id);
      carregarContas();
    } catch (e) {
      alert("Erro ao excluir");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="ui-section-header">
          <div>
            <h2 className="ui-section-title">Plano de Contas</h2>
            <p className="ui-section-subtitle">Categorias financeiras usadas para organizar receitas e despesas.</p>
          </div>
          <Button onClick={() => abrirModal()}>+ Nova Conta</Button>
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
      </Card>

      {modalAberto && (
        <Modal title={`${editandoId ? "Editar" : "Nova"} Conta`} onClose={fecharModal}>
          {erro && <p className="text-red-700 font-semibold mb-3">{erro}</p>}

          <div className="grid grid-cols-1 gap-3">
            <Input
              label="Nome"
              type="text"
              placeholder="Nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
            <Select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
              <option value="despesa">Despesa</option>
              <option value="receita">Receita</option>
            </Select>
            <label className="ui-field">
              <span className="ui-field__label">Descrição</span>
              <textarea
                placeholder="Descrição"
                className="ui-input min-h-24"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </label>
            <Input
              label="Quantidade sugerida"
              type="number"
              placeholder="Opcional"
              value={form.quantidade_sugerida}
              onChange={(e) => setForm({ ...form, quantidade_sugerida: e.target.value })}
            />
            <Input
              label="Dia sugerido"
              type="number"
              placeholder="1-31, opcional"
              value={form.dia_sugerido}
              onChange={(e) => setForm({ ...form, dia_sugerido: e.target.value })}
            />
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
