import React from "react";
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { toast } from "react-toastify";
import useAuth from "../../hooks/useAuth";

export default function UnitScopeSelector() {
  const { currentUnit, allowedUnits, setActiveUnit } = useAuth();
  const navigate = useNavigate();

  if (!currentUnit) return null;

  const units = Array.isArray(allowedUnits) ? allowedUnits : [];
  const hasMultipleUnits = units.length > 1;

  function handleChange(e) {
    try {
      const unit = setActiveUnit(e.target.value);
      toast.success(`Unidade alterada para ${unit.nome}.`);
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.message || "Não foi possível alterar a unidade.");
    }
  }

  if (hasMultipleUnits) {
    return (
      <label className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/10 text-white">
        <Building2 size={15} />
        <span className="sr-only">Unidade atual</span>
        <select
          value={currentUnit.id}
          onChange={handleChange}
          className="bg-transparent text-xs font-bold outline-none cursor-pointer"
          title="Selecionar unidade"
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id} className="text-slate-900">
              {unit.nome}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/10 text-white">
      <Building2 size={15} />
      <div className="leading-tight">
        <div className="text-[0.65rem] uppercase tracking-wide text-white/60">Unidade</div>
        <div className="text-xs font-bold">{currentUnit.nome}</div>
      </div>
    </div>
  );
}
