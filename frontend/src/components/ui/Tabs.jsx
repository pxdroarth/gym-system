import React from "react";

export function Tabs({ className = "", children, ...props }) {
  return (
    <div className={["ui-tabs", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}

export function TabButton({ as: Component = "button", active = false, className = "", children, type, ...props }) {
  const resolvedType = Component === "button" ? type || "button" : type;

  return (
    <Component
      type={resolvedType}
      className={["ui-tab", active ? "ui-tab--active" : "", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </Component>
  );
}
