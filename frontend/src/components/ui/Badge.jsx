import React from "react";

const toneClass = {
  blue: "ui-badge--blue",
  green: "ui-badge--green",
  red: "ui-badge--red",
  amber: "ui-badge--amber",
  gray: "ui-badge--gray",
};

export default function Badge({ tone = "gray", className = "", children, ...props }) {
  return (
    <span
      className={["ui-badge", toneClass[tone] || toneClass.gray, className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}
