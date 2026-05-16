import React, { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Card from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import PageHeader from "../../components/ui/PageHeader";
import { fetchMensalidadesAlunoStatus, registrarPagamentoAntecipado } from "../../services/mensalidadeService";
import { getApiErrorMessage } from "../../utils/getApiErrorMessage";

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
        const data = await fetchMensalidadesAlunoStatus(alunoId, "em_aberto");
        if (!data.mensalidades || data.mensalidades.length === 0) {
          setMensagem("Nenhuma mensalidade pendente.");
          setMensalidades([]);
        } else {
          setMensagem(null);
          setMensalidades(data.mensalidades);
        }
      } catch (error) {
        setMensagem(`Erro: ${getApiErrorMessage(error)}`);
        setMensalidades([]);
      }
    }
    fetchMensalidades();
  }, [alunoId]);

  const mensalidadesIds = watch("mensalidadesIds") || [];
  const desconto = watch("desconto") || 0;

  const valorTotal = mensalidades
    .filter((m) => mensalidadesIds.includes(m.id))
    .reduce((acc, m) => acc + (Number(m.valor_cobrado) * (1 - desconto / 100)), 0);

  const onSubmit = async (data) => {
    if (!data.mensalidadesIds || data.mensalidadesIds.length === 0) {
      setMensagem("Selecione pelo menos uma mensalidade");
      return;
    }

    setMensagem(null);

    try {
      const resposta = await registrarPagamentoAntecipado({
        mensalidadesIds: data.mensalidadesIds,
        desconto: Number(data.desconto),
      });

      setMensagem(`Pagamento realizado para ${resposta.mensalidades.length} mensalidades`);

      setMensalidades((prev) => prev.filter((m) => !data.mensalidadesIds.includes(m.id)));
      setValue("mensalidadesIds", []);
      setValue("desconto", 0);
    } catch (error) {
      setMensagem(`Erro: ${getApiErrorMessage(error)}`);
    }
  };

  const toggleCheckbox = (id, checked) => {
    if (checked) {
      setValue("mensalidadesIds", [...mensalidadesIds, id]);
    } else {
      setValue("mensalidadesIds", mensalidadesIds.filter((i) => i !== id));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pagamento Antecipado"
        subtitle="Selecione mensalidades em aberto e aplique desconto quando necessário."
      />

      <Card className="p-5 max-w-3xl">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {mensagem && (
            <Badge tone={mensagem.startsWith("Erro") ? "red" : "green"}>
              {mensagem}
            </Badge>
          )}

          <Controller
            name="desconto"
            control={control}
            render={({ field }) => (
              <Input {...field} label="Desconto (%)" type="number" min="0" max="100" />
            )}
          />

          <div className="border rounded-lg p-3 max-h-72 overflow-y-auto">
            {mensalidades.length === 0 ? (
              <EmptyState title="Nenhuma mensalidade pendente." />
            ) : (
              mensalidades.map((m) => (
                <label key={m.id} className="flex items-center gap-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mensalidadesIds.includes(m.id)}
                    onChange={(e) => toggleCheckbox(m.id, e.target.checked)}
                  />
                  <span>
                    #{m.id} - Vencimento: {new Date(m.vencimento).toLocaleDateString("pt-BR")} - Valor: R$ {Number(m.valor_cobrado).toFixed(2)}
                  </span>
                </label>
              ))
            )}
          </div>

          <div className="ui-info-item">
            <div className="ui-info-item__label">Total com desconto</div>
            <div className="ui-info-item__value">
              {valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
          </div>

          <Button type="submit" disabled={mensalidadesIds.length === 0} className="w-full">
            Confirmar Pagamento
          </Button>
        </form>
      </Card>
    </div>
  );
}
