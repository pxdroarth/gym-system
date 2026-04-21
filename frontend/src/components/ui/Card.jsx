import React from "react";

export default function Card({ className = "", children, ...props }) {
  return (
    <section className={["ui-card", className].filter(Boolean).join(" ")} {...props}>
      {children}
    </section>
  );
}
