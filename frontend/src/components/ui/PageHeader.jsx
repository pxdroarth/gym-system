import React from "react";

export default function PageHeader({ title, subtitle, actions, className = "" }) {
  return (
    <header className={["ui-page-header", className].filter(Boolean).join(" ")}>
      <div>
        <h1 className="ui-page-header__title">{title}</h1>
        {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </header>
  );
}
