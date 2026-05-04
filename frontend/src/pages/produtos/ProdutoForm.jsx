import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { createProduto, updateProduto } from "../../services/Api";
import Button from "../../components/ui/Button";

export default function ProdutoForm({ produto, onSuccess, onCancel }) {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm();

  useEffect(() => {
    if (produto) reset(produto);
    else reset();
  }, [produto, reset]);

  const estoqueAtual = Number(watch("estoque") || produto?.estoque || 0);
  const precoAtual = Number(watch("preco") || produto?.preco || 0);
  const valorProjetado = estoqueAtual * precoAtual;

  const onSubmit = async (data) => {
    try {
      const formData = new FormData();
      formData.append("nome", data.nome);
      formData.append("descricao", data.descricao || "");
      formData.append("preco", data.preco);
      formData.append("estoque", data.estoque);
      if (data.imagem && data.imagem.length > 0) {
        formData.append("imagem", data.imagem[0]);
      }

      if (produto?.id) {
        await updateProduto(produto.id, formData);
        toast.success("Produto atualizado!");
      } else {
        await createProduto(formData);
        toast.success("Produto cadastrado!");
      }

      onSuccess();
    } catch (error) {
      toast.error(`Erro: ${error.message || "Erro desconhecido"}`);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="product-form-grid">
        <label className="ui-field product-form-grid__full">
          <span className="ui-field__label">Nome *</span>
          <input
            {...register("nome", { required: "Nome é obrigatório" })}
            className="ui-input"
            placeholder="Nome do produto"
          />
          {errors.nome && <p className="text-red-600 text-sm">{errors.nome.message}</p>}
        </label>

        <label className="ui-field product-form-grid__full">
          <span className="ui-field__label">Descrição</span>
          <textarea
            {...register("descricao")}
            className="ui-input min-h-28"
            placeholder="Descrição opcional para apoio da operação"
            rows={4}
          />
        </label>

        <label className="ui-field">
          <span className="ui-field__label">Preço * (R$)</span>
          <input
            type="text"
            {...register("preco", { required: "Preço é obrigatório" })}
            className="ui-input"
            placeholder="0.00"
          />
          {errors.preco && <p className="text-red-600 text-sm">{errors.preco.message}</p>}
        </label>

        <label className="ui-field">
          <span className="ui-field__label">Estoque *</span>
          <input
            type="number"
            {...register("estoque", { required: "Estoque é obrigatório", min: { value: 0, message: "Mínimo 0" } })}
            className="ui-input"
            placeholder="0"
          />
          {errors.estoque && <p className="text-red-600 text-sm">{errors.estoque.message}</p>}
        </label>

        <label className="ui-field">
          <span className="ui-field__label">Imagem</span>
          <input
            type="file"
            {...register("imagem")}
            accept="image/*"
            className="ui-input product-file-input"
          />
        </label>
      </div>

      <div className="product-form-note">
        <h3 className="product-form-note__title">Resumo operacional</h3>
        <p className="product-form-note__copy">
          Estoque atual estimado: <strong>{estoqueAtual}</strong> unidade(s). Valor projetado do saldo:{" "}
          <strong>{Number(valorProjetado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>.
          O fluxo de upload e envio continua exatamente o mesmo via FormData.
        </p>
      </div>

      <div className="flex gap-3 justify-end pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : produto ? "Atualizar" : "Cadastrar"}
        </Button>
      </div>
    </form>
  );
}
