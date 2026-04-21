import React from "react";
import Card from "./Card";

const toneClass = {
  blue: "ui-kpi-card--blue",
  green: "ui-kpi-card--green",
  red: "ui-kpi-card--red",
  amber: "ui-kpi-card--amber",
  gray: "ui-kpi-card--gray",
};

export default function KpiCard({ label, value, subtitle, icon, tone = "blue", onClick }) {
  const Component = onClick ? "button" : "div";

  return (
    <Card className={`ui-kpi-card ${toneClass[tone] || toneClass.blue}`}>
      <Component className="ui-kpi-card__inner" onClick={onClick} type={onClick ? "button" : undefined}>
        <div>
          <div className="ui-kpi-card__label">{label}</div>
          <div className="ui-kpi-card__value">{value}</div>
          {subtitle && <div className="ui-kpi-card__subtitle">{subtitle}</div>}
        </div>
        {icon && <div className="ui-kpi-card__icon">{icon}</div>}
      </Component>
    </Card>
  );
}
