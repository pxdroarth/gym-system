import React from "react";

export default function EmptyState({ title = "Nenhum registro encontrado.", description, action }) {
  return (
    <div className="ui-empty-state">
      <div className="ui-empty-state__title">{title}</div>
      {description && <div className="ui-empty-state__description">{description}</div>}
      {action && <div className="ui-empty-state__action">{action}</div>}
    </div>
  );
}
