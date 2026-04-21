import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";

export default function Modal({ title, children, onClose, className = "", footer }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const content = (
    <div className="ui-modal-backdrop" role="presentation">
      <div className={["ui-modal", className].filter(Boolean).join(" ")} role="dialog" aria-modal="true">
        <header className="ui-modal__header">
          <h2 className="ui-modal__title">{title}</h2>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Fechar modal">
              Fechar
            </Button>
          )}
        </header>
        <div className="ui-modal__body">{children}</div>
        {footer && <footer className="ui-modal__footer">{footer}</footer>}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
