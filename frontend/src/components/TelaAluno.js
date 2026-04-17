import React from "react";
import { useNavigate } from "react-router-dom";

export default function TelaAluno({ aluno }) {
  const navigate = useNavigate();

  // Função para calcular dias restantes para o vencimento
  function calcularDiasRestantes(diaVencimento) {
    if (!diaVencimento) return null;

    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();

    let proxVencimento = new Date(ano, mes, diaVencimento);
    if (proxVencimento < hoje) {
      // Se já passou o dia deste mês, usa o próximo mês
      proxVencimento = new Date(ano, mes + 1, diaVencimento);
    }

    const diff = proxVencimento - hoje;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  const diasRestantes = calcularDiasRestantes(
    aluno.dia_vencimento_mensalidade || aluno.dia_vencimento
  );

  return (
    <div className="bg-white rounded shadow p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Informações do Aluno</h2>
        <button
          onClick={() => navigate(`/alunos/editar/${aluno.id}`)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
        >
          Editar Aluno
        </button>
      </div>

      <div className="space-y-2 text-base">
        <p><strong>Nome:</strong> {aluno.nome || "Não informado"}</p>
        <p><strong>CPF:</strong> {aluno.cpf || "Não informado"}</p>
        <p><strong>Email:</strong> {aluno.email || "Não informado"}</p>
        <p><strong>Status:</strong> {aluno.status || "Não informado"}</p>
      </div>

      <hr className="my-6" />

      <h3 className="text-lg font-semibold mb-2">Mensalidade Atual</h3>
      <div className="space-y-2 text-base">
        <p><strong>Plano:</strong> {aluno.plano_nome || "Não informado"}</p>
        <p>
          <strong>Valor:</strong>{" "}
          {aluno.valor != null
            ? `R$ ${Number(aluno.valor).toFixed(2)}`
            : "Não informado"}
        </p>
        <p>
          <strong>Dia de Vencimento:</strong>{" "}
          {aluno.dia_vencimento_mensalidade ||
            aluno.dia_vencimento ||
            "Não informado"}
        </p>
        <p>
          <strong>Status:</strong>{" "}
          {aluno.status_mensalidade === "pago" ? (
            <span className="text-green-600 font-semibold">Em dia</span>
          ) : (
            <span className="text-red-600 font-semibold">Pendente</span>
          )}
        </p>
        {diasRestantes !== null && (
          <p>
            <strong>Dias para vencimento:</strong> {diasRestantes}{" "}
            {diasRestantes === 1 ? "dia" : "dias"}
          </p>
        )}
      </div>
    </div>
  );
}
