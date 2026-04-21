import React from "react";

export default function PillButton({ active = false, className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={["ui-pill-button", active ? "ui-pill-button--active" : "", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
