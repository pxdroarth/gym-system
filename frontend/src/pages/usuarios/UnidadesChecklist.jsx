import React from "react";
import Badge from "../../components/ui/Badge";

// Lista de unidades gerenciaveis (vinda do backend) com escolha da unidade padrao.
export default function UnidadesChecklist({ unidades = [], selecionadas = [], padraoId, onChange, disabled }) {
  const selecionadasSet = new Set(selecionadas.map(Number));

  function toggle(unitId) {
    const id = Number(unitId);
    const proximas = selecionadasSet.has(id)
      ? selecionadas.filter((value) => Number(value) !== id)
      : [...selecionadas, id];
    const proximoPadrao = proximas.map(Number).includes(Number(padraoId)) ? Number(padraoId) : (proximas[0] ? Number(proximas[0]) : null);
    onChange?.({ unitIds: proximas.map(Number), padraoId: proximoPadrao });
  }

  function definirPadrao(unitId) {
    onChange?.({ unitIds: selecionadas.map(Number), padraoId: Number(unitId) });
  }

  if (!unidades.length) {
    return <div className="text-sm text-slate-500">Nenhuma unidade disponivel para o seu escopo.</div>;
  }

  return (
    <div className="space-y-2" role="group" aria-label="Unidades autorizadas">
      {unidades.map((unidade) => {
        const id = Number(unidade.id);
        const marcada = selecionadasSet.has(id);
        return (
          <div key={id} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                name="unit_ids"
                value={id}
                checked={marcada}
                disabled={disabled}
                onChange={() => toggle(id)}
                data-testid={`unidade-${id}`}
              />
              <span className="font-medium">{unidade.nome}</span>
              {Number(unidade.is_matriz) === 1 && <Badge tone="gray">Matriz</Badge>}
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input
                type="radio"
                name="unit_padrao_id"
                value={id}
                checked={marcada && Number(padraoId) === id}
                disabled={disabled || !marcada}
                onChange={() => definirPadrao(id)}
              />
              Padrão
            </label>
          </div>
        );
      })}
    </div>
  );
}
