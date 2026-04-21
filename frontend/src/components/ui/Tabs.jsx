import React from "react";

export function Tabs({ className = "", children, ...props }) {
  return (
    <div className={["ui-tabs", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}

export function TabButton({ active = false, className = "", children, ...props }) {
  return (
    <button
      type="button"
      className={["ui-tab", active ? "ui-tab--active" : "", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}
