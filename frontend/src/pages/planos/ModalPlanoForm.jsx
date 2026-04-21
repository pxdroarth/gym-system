import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";

function criarFormVazio() {
  return {
    nome: "",
    valor_base: "",
    descricao: "",
    duracao_em_dias: 30,
    quantidade_max_pessoas: 1,
  };
}

export default function ModalPlanoForm({ open, onClose, planoEdicao, onSalvar }) {
  const [form, setForm] = useState(criarFormVazio());
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (planoEdicao) {
      setForm({
        nome: planoEdicao.nome || "",
        valor_base: planoEdicao.valor_base || "",
        descricao: planoEdicao.descricao || "",
        duracao_em_dias: planoEdicao.duracao_em_dias || 30,
        quantidade_max_pessoas: planoEdicao.quantidade_max_pessoas || 1,
      });
    } else {
      setForm(criarFormVazio());
    }
  }, [planoEdicao, open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome || !form.valor_base || !form.duracao_em_dias || !form.quantidade_max_pessoas) {
      return toast.error("Preencha todos os campos obrigatórios.");
    }

    const quantidadeMaxPessoas = Number(form.quantidade_max_pessoas);
    const payload = {
      ...form,
      valor_base: Number(form.valor_base),
      duracao_em_dias: Number(form.duracao_em_dias),
      quantidade_max_pessoas: quantidadeMaxPessoas,
      compartilhado: quantidadeMaxPessoas > 1,
    };

    setCarregando(true);
    try {
      const metodo = planoEdicao ? "PUT" : "POST";
      const url = planoEdicao
        ? `http://localhost:3001/planos/${planoEdicao.id}`
        : "http://localhost:3001/planos";

      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const resposta = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(resposta.error || "Erro ao salvar plano");

      toast.success("Plano salvo com sucesso!");
      onSalvar?.();
    } catch (error) {
      toast.error(error.message || "Erro ao salvar plano");
    } finally {
      setCarregando(false);
    }
  };

  if (!open) return null;

  return (
    <Modal title={planoEdicao ? "Editar Plano" : "Novo Plano"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome"
          name="nome"
          value={form.nome}
          onChange={handleChange}
          required
        />

        <Input
          label="Valor Base (R$)"
          name="valor_base"
          type="number"
          step="0.01"
          value={form.valor_base}
          onChange={handleChange}
          required
        />

        <Input
          label="Duração (dias)"
          name="duracao_em_dias"
          type="number"
          min="1"
          value={form.duracao_em_dias}
          onChange={handleChange}
          required
        />

        <Input
          label="Quantidade máxima de pessoas"
          name="quantidade_max_pessoas"
          type="number"
          min="1"
          value={form.quantidade_max_pessoas}
          onChange={handleChange}
          required
        />

        <label className="ui-field">
          <span className="ui-field__label">Descrição</span>
          <textarea
            name="descricao"
            value={form.descricao}
            onChange={handleChange}
            className="ui-input min-h-24"
            placeholder="Descrição opcional"
          />
        </label>

        <div className="ui-info-item">
          <div className="ui-info-item__label">Tipo do plano</div>
          <div className="ui-info-item__value">
            {Number(form.quantidade_max_pessoas || 1) > 1 ? "Compartilhado" : "Individual"}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={carregando}>
            {carregando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
