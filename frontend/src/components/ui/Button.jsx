import React from "react";

const variantClass = {
  primary: "ui-button--primary",
  secondary: "ui-button--secondary",
  ghost: "ui-button--ghost",
  danger: "ui-button--danger",
  success: "ui-button--success",
};

const sizeClass = {
  sm: "ui-button--sm",
  md: "ui-button--md",
  lg: "ui-button--lg",
};

export default function Button({
  as: Component = "button",
  variant = "primary",
  size = "md",
  className = "",
  type,
  ...props
}) {
  const resolvedType = Component === "button" ? type || "button" : type;

  return (
    <Component
      type={resolvedType}
      className={[
        "ui-button",
        variantClass[variant] || variantClass.primary,
        sizeClass[size] || sizeClass.md,
        className,
      ].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
