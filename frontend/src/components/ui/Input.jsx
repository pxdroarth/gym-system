import React from "react";

export default function Input({ label, className = "", id, ...props }) {
  const input = (
    <input id={id} className={["ui-input", className].filter(Boolean).join(" ")} {...props} />
  );

  if (!label) return input;

  return (
    <label className="ui-field">
      <span className="ui-field__label">{label}</span>
      {input}
    </label>
  );
}
