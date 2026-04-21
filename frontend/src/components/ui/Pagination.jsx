import React from "react";
import Button from "./Button";

export default function Pagination({ page, totalPages, onPageChange, canPrevious, canNext }) {
  const resolvedTotal = Math.max(1, Number(totalPages || 1));

  return (
    <div className="ui-pagination">
      <Button
        variant="ghost"
        size="sm"
        disabled={canPrevious === false || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        Anterior
      </Button>
      <span className="ui-pagination__status">
        Página {page} de {resolvedTotal}
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={canNext === false || page >= resolvedTotal}
        onClick={() => onPageChange(page + 1)}
      >
        Próxima
      </Button>
    </div>
  );
}
