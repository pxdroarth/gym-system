import React from "react";
import { useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { toast } from "react-toastify";
import useAuth from "../../hooks/useAuth";
import getApiErrorMessage from "../../utils/getApiErrorMessage";

export default function UnitScopeSelector() {
  const { currentUnit, allowedUnits, setActiveUnit } = useAuth();
  const navigate = useNavigate();

  if (!currentUnit) return null;

  const units = Array.isArray(allowedUnits) ? allowedUnits : [];
  const hasMultipleUnits = units.length > 1;

  function handleChange(event) {
    try {
      const unit = setActiveUnit(event.target.value);
      toast.success(`Unidade alterada para ${unit.nome}.`);
      navigate("/dashboard");
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }

  if (hasMultipleUnits) {
    return (
      <label className="app-shell-chip hidden md:inline-flex">
        <Building2 size={15} className="app-shell-chip__icon" />
        <div className="leading-tight">
          <div className="app-shell-chip__label">Unidade atual</div>
          <select
            value={currentUnit.id}
            onChange={handleChange}
            className="bg-transparent text-[0.78rem] font-extrabold outline-none cursor-pointer text-slate-900"
            title="Selecionar unidade"
          >
            {units.map((unit) => (
              <option key={unit.id} value={unit.id} className="text-slate-900">
                {unit.nome}
              </option>
            ))}
          </select>
        </div>
      </label>
    );
  }

  return (
    <div className="app-shell-chip hidden md:inline-flex">
      <Building2 size={15} className="app-shell-chip__icon" />
      <div className="leading-tight">
        <div className="app-shell-chip__label">Unidade atual</div>
        <div className="app-shell-chip__value">{currentUnit.nome}</div>
      </div>
    </div>
  );
}
