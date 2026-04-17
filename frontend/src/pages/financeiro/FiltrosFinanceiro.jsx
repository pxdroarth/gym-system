import React, { useState } from 'react';

export default function FiltrosFinanceiro({ onAplicarFiltros }) {
  // Estado local para os filtros, todos no formato dd/mm/yyyy
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [status, setStatus] = useState('todos');
  const [tipoDados, setTipoDados] = useState('todos');

  function aplicar() {
    onAplicarFiltros({
      dataInicial,
      dataFinal,
      status,
      tipoDados
    });
  }

  return (
    <div className="mb-6 flex flex-wrap gap-4 items-end">
      {/* Inputs de data (tipo texto com máscara, ou tipo date se quiser) */}
      <div>
        <label className="block text-sm font-medium mb-1">Data Inicial</label>
        <input
          type="text"
          placeholder="dd/mm/aaaa"
          value={dataInicial}
          onChange={e => setDataInicial(e.target.value)}
          className="border rounded px-2 py-1 w-32"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Data Final</label>
        <input
          type="text"
          placeholder="dd/mm/aaaa"
          value={dataFinal}
          onChange={e => setDataFinal(e.target.value)}
          className="border rounded px-2 py-1 w-32"
        />
      </div>

      {/* Status */}
      <div>
        <label className="block text-sm font-medium mb-1">Status</label>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="border rounded px-2 py-1 w-32"
        >
          <option value="todos">Todos</option>
          <option value="pago">Pago</option>
          <option value="em_aberto">Em Aberto</option>
        </select>
      </div>

      {/* Tipo de Dados */}
      <div>
        <label className="block text-sm font-medium mb-1">Tipo de Dados</label>
        <select
          value={tipoDados}
          onChange={e => setTipoDados(e.target.value)}
          className="border rounded px-2 py-1 w-32"
        >
          <option value="todos">Todos</option>
          <option value="mensalidades">Mensalidades</option>
          <option value="vendas">Vendas</option>
        </select>
      </div>

      {/* Botão aplicar */}
      <div>
        <button
          onClick={aplicar}
          className="bg-blue-600 text-white px-4 py-2 rounded"
          type="button"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
