// frontend/src/components/confirm.js
import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

function classByVariant(variant) {
  switch ((variant || "primary").toLowerCase()) {
    case "danger":
      return {
        ring: "ring-red-500/30",
        header: "text-red-600",
        confirmBtn:
          "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500 text-white",
      };
    case "warning":
      return {
        ring: "ring-amber-500/30",
        header: "text-amber-600",
        confirmBtn:
          "bg-amber-600 hover:bg-amber-700 focus-visible:ring-amber-500 text-white",
      };
    default:
      return {
        ring: "ring-blue-500/30",
        header: "text-blue-600",
        confirmBtn:
          "bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500 text-white",
      };
  }
}

function ConfirmDialog({
  title = "Confirmação",
  message = "Tem certeza que deseja confirmar?",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "primary",
  onResolve,
}) {
  const colors = classByVariant(variant);
  const cancelRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = prev);
  }, []);

  useEffect(() => { cancelRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onResolve(false);
      if (e.key === "Tab") {
        const nodes = dialogRef.current?.querySelectorAll(
          'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
        );
        if (!nodes?.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResolve]);

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onResolve(false)}
      className="fixed inset-0 z-[1000] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4"
      role="dialog" aria-modal="true"
    >
      <div
        ref={dialogRef}
        className={`w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ${colors.ring}`}
      >
        <div className="px-5 pt-5">
          <h2 className={`text-lg font-semibold ${colors.header}`}>{title}</h2>
          <p className="mt-2 text-sm text-gray-600">{message}</p>
        </div>
        <div className="px-5 pb-5 pt-4 flex gap-3 justify-end">
          <button
            ref={cancelRef}
            onClick={() => onResolve(false)}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-400"
          >
            {cancelText}
          </button>
          <button
            onClick={() => onResolve(true)}
            className={`px-4 py-2 rounded-lg ${colors.confirmBtn} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Abre o modal e retorna Promise<boolean> */
export function confirm(opts = {}) {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const cleanup = (val) => { root.render(<></>); root.unmount(); host.remove(); resolve(!!val); };
    root.render(<ConfirmDialog {...opts} onResolve={cleanup} />);
  });
}
