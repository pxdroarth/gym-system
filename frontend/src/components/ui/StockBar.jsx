import React from "react";

function getTone(value, max) {
  const ratio = max > 0 ? value / max : 0;
  if (ratio <= 0.15) return "danger";
  if (ratio <= 0.4) return "warning";
  return "success";
}

export default function StockBar({ value = 0, max, showLabel = true }) {
  const safeValue = Number(value || 0);
  const safeMax = Number(max || Math.max(safeValue, 1));
  const percent = Math.max(0, Math.min(100, (safeValue / safeMax) * 100));
  const tone = getTone(safeValue, safeMax);

  return (
    <div className="ui-stock">
      {showLabel && <span className="ui-stock__value">{safeValue}</span>}
      <div className="ui-stock__track" aria-label={`Estoque ${safeValue}`}>
        <div className={`ui-stock__bar ui-stock__bar--${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
