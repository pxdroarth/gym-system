import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";

export default function PagamentoAntecipado({ alunoId }) {
  const { control, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      desconto: 0,
      mensalidadesIds: [],
    },
  });

  const [mensalidades, setMensalidades] = useState([]);
  const [mensagem, setMensagem] = useState(null);

  useEffect(() => {
    async function fetchMensalidades() {
      try {
        const res = await fetch(`http://localhost:3001/mensalidades/aluno/${alunoId}?status=em_aberto`);
        if (!res.ok) throw new Error("Erro ao carregar mensalidades");
        const data = await res.json();
        if (!data.mensalidades || data.mensalidades.length === 0) {
          setMensagem("Nenhuma mensalidade pendente.");
          setMensalidades([]);
        } else {
          setMensagem(null);
          setMensalidades(data.mensalidades);
        }
      } catch (error) {
        setMensagem("Erro ao carregar mensalidades");
        setMensalidades([]);
        console.error(error);
      }
    }
    fetchMensalidades();
  }, [alunoId]);

  const mensalidadesIds = watch("mensalidadesIds") || [];
  const desconto = watch("desconto") || 0;

  const valorTotal = mensalidades
    .filter(m => mensalidadesIds.includes(m.id))
    .reduce((acc, m) => acc + (Number(m.valor_cobrado) * (1 - desconto / 100)), 0);

  const onSubmit = async (data) => {
    if (!data.mensalidadesIds || data.mensalidadesIds.length === 0) {
      setMensagem("Selecione pelo menos uma mensalidade");
      return;
    }

    setMensagem(null);

    try {
      const res = await fetch("http://localhost:3001/mensalidades/pagamento-antecipado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensalidadesIds: data.mensalidadesIds,
          desconto: Number(data.desconto),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro desconhecido");
      }

      const resposta = await res.json();
      setMensagem(`Pagamento realizado para ${resposta.mensalidades.length} mensalidades`);

      setMensalidades(prev => prev.filter(m => !data.mensalidadesIds.includes(m.id)));
      setValue("mensalidadesIds", []);
      setValue("desconto", 0);
    } catch (error) {
      setMensagem(`Erro: ${error.message}`);
    }
  };

  const toggleCheckbox = (id, checked) => {
    if (checked) {
      setValue("mensalidadesIds", [...mensalidadesIds, id]);
    } else {
      setValue("mensalidadesIds", mensalidadesIds.filter(i => i !== id));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg mx-auto p-6 bg-white rounded shadow space-y-4">
      <h2 className="text-xl font-bold">Pagamento Antecipado</h2>

      {mensagem && (
        <p className={`p-2 rounded ${mensagem.startsWith("Erro") ? "bg-red-200 text-red-800" : "bg-green-200 text-green-800"}`}>
          {mensagem}
        </p>
      )}

      <div>
        <label className="block mb-1 font-semibold">Desconto (%)</label>
        <Controller
          name="desconto"
          control={control}
          render={({ field }) => (
            <input {...field} type="number" min="0" max="100" className="w-full border px-3 py-2 rounded" />
          )}
        />
      </div>

      <div className="max-h-64 overflow-y-auto border rounded p-2">
        {mensalidades.length === 0 ? (
          <p>Nenhuma mensalidade pendente.</p>
        ) : (
          mensalidades.map((m) => (
            <label key={m.id} className="flex items-center space-x-2 py-1">
              <input
                type="checkbox"
                checked={mensalidadesIds.includes(m.id)}
                onChange={e => toggleCheckbox(m.id, e.target.checked)}
              />
              <span>{`#${m.id} - Vencimento: ${new Date(m.vencimento).toLocaleDateString()} - Valor: R$ ${Number(m.valor_cobrado).toFixed(2)}`}</span>
            </label>
          ))
        )}
      </div>

      <div className="font-semibold text-lg">
        Total com desconto: R$ {valorTotal.toFixed(2)}
      </div>

      <button
        type="submit"
        disabled={mensalidadesIds.length === 0}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        Confirmar Pagamento
      </button>
    </form>
  );
}
