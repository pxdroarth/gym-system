import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { createProduto, updateProduto } from "../../services/Api";
import { toast } from "react-toastify";

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
    <form onSubmit={handleSubmit(onSubmit)} className="bg-gray-50 p-4 rounded shadow space-y-4">
      <div>
        <label className="block mb-1">Nome*</label>
        <input
          {...register("nome", { required: "Nome é obrigatório" })}
          className="w-full border px-3 py-2 rounded"
          placeholder="Nome do Produto"
        />
        {errors.nome && <p className="text-red-500">{errors.nome.message}</p>}
      </div>

      <div>
        <label className="block mb-1">Descrição</label>
        <textarea
          {...register("descricao")}
          className="w-full border px-3 py-2 rounded"
          placeholder="Descrição opcional"
          rows={3}
        />
      </div>

      <div>
        <label className="block mb-1">Preço* (R$)</label>
        <input
          type="text"
          {...register("preco", { required: "Preço é obrigatório" })}
          className="w-full border px-3 py-2 rounded"
          placeholder="0.00"
        />
        {errors.preco && <p className="text-red-500">{errors.preco.message}</p>}
      </div>

      <div>
        <label className="block mb-1">Estoque*</label>
        <input
          type="number"
          {...register("estoque", { required: "Estoque é obrigatório", min: { value: 0, message: "Mínimo 0" } })}
          className="w-full border px-3 py-2 rounded"
          placeholder="0"
        />
        {errors.estoque && <p className="text-red-500">{errors.estoque.message}</p>}
      </div>

      <div>
        <label className="block mb-1">Imagem</label>
        <input
          type="file"
          {...register("imagem")}
          accept="image/*"
        />
      </div>

      <div className="flex gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {isSubmitting ? "Salvando..." : produto ? "Atualizar" : "Cadastrar"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
