import React from "react";

export default function Select({ label, className = "", id, children, ...props }) {
  const select = (
    <select id={id} className={["ui-select", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </select>
  );

  if (!label) return select;

  return (
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {select}
    </label>
  );
}
