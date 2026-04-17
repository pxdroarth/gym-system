import React, { useState, useEffect } from "react";

export default function FormAluno({ aluno, planos, onSalvar, onCancelar }) {
  // Estado local para os campos do formulário
  const [nome, setNome] = useState("");
  const [numero, setNumero] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("ativo");
  const [planoId, setPlanoId] = useState("");

  // Sempre que o "aluno" mudar, atualiza os campos do formulário
  useEffect(() => {
    if (aluno) {
      setNome(aluno.nome || "");
      setNumero(aluno.numero || "");
      setEmail(aluno.email || "");
      setStatus(aluno.status || "ativo");
      setPlanoId(aluno.plano_id ? String(aluno.plano_id) : "");
    } else {
      // Se não tiver aluno, limpa o formulário
      setNome("");
      setNumero("");
      setEmail("");
      setStatus("ativo");
      setPlanoId("");
    }
  }, [aluno]);

  // Função para enviar os dados para o componente pai
  function handleSubmit(e) {
    e.preventDefault();
    const dadosAluno = {
      nome,
      numero,
      email,
      status,
      plano_id: Number(planoId),
    };
    onSalvar(dadosAluno);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-semibold mb-1" htmlFor="nome">
          Nome
        </label>
        <input
          id="nome"
          type="text"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2"
          required
          autoFocus
        />
      </div>
      <div>
        <label>Dia do Vencimento</label>
        <input
          type="number"
          min="1"
          max="31"
          value={diaVencimento}
          onChange={(e) => setDiaVencimento(e.target.value)}
          placeholder="Ex: 5"
        />
      </div>

      <div>
        <label className="block font-semibold mb-1" htmlFor="numero">
          Número
        </label>
        <input
          id="numero"
          type="text"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2"
        />
      </div>

      <div>
        <label className="block font-semibold mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block font-semibold mb-1" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2"
        >
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>

      <div>
        <label className="block font-semibold mb-1" htmlFor="plano">
          Plano
        </label>
        <select
          id="plano"
          value={planoId}
          onChange={(e) => setPlanoId(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2"
          required
        >
          <option value="">Selecione um plano</option>
          {planos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} - R$ {p.valor_base.toFixed(2)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end space-x-2">
        <button
          type="button"
          onClick={onCancelar}
          className="px-4 py-2 rounded border border-gray-300 hover:bg-gray-100"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
        >
          Salvar
        </button>
      </div>
    </form>
  );
}
