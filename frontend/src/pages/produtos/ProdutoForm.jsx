import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { createProduto, updateProduto } from "../../services/Api";
import { toast } from "react-toastify";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";

export default function ProdutoForm({ produto, onSuccess, onCancel }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm();

  useEffect(() => {
    if (produto) reset(produto);
    else reset();
  }, [produto, reset]);

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
    } catch (err) {
      toast.error("Erro: " + (err.message || "Erro desconhecido"));
    }
  };

  return (
    <Card className="p-5">
      <div className="ui-section-header px-0 pt-0">
        <div>
          <h2 className="ui-section-title">{produto ? "Editar Produto" : "Cadastrar Produto"}</h2>
          <p className="ui-section-subtitle">
            {produto ? "Atualize dados, estoque e imagem do produto." : "Cadastre itens vendidos na recepção."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="ui-field md:col-span-3">
            <span className="ui-field__label">Nome *</span>
            <input
              {...register("nome", { required: "Nome é obrigatório" })}
              className="ui-input"
              placeholder="Nome do Produto"
            />
            {errors.nome && <p className="text-red-600 text-sm">{errors.nome.message}</p>}
          </label>

          <label className="ui-field md:col-span-3">
            <span className="ui-field__label">Descrição</span>
            <textarea
              {...register("descricao")}
              className="ui-input min-h-24"
              placeholder="Descrição opcional"
              rows={3}
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
              className="ui-input"
            />
          </label>
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
    </Card>
  );
}
