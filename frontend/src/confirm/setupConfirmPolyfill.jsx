// frontend/src/confirm/setupConfirmPolyfill.js
import { confirm as confirmModal } from "@/components/confirm";

// 👇 valores via .env (opcionais)
const MODE = (import.meta.env?.VITE_CONFIRM_MODE || "auto").toLowerCase(); // auto | sync | async | native
const TITLE = import.meta.env?.VITE_CONFIRM_TITLE || "Confirmação";
const MESSAGE = import.meta.env?.VITE_CONFIRM_MESSAGE || "Tem certeza que deseja confirmar?";
const CONFIRM = import.meta.env?.VITE_CONFIRM_OK || "Confirmar";
const CANCEL = import.meta.env?.VITE_CONFIRM_CANCEL || "Cancelar";
const VARIANT = (import.meta.env?.VITE_CONFIRM_VARIANT || "primary").toLowerCase(); // primary|warning|danger

export const DEFAULTS = {
  title: TITLE,
  message: MESSAGE,
  confirmText: CONFIRM,
  cancelText: CANCEL,
  variant: VARIANT,
  mode: MODE,
};

// permite alterar em runtime
window.setConfirmDefaults = function setConfirmDefaults(patch = {}) {
  Object.assign(DEFAULTS, patch || {});
};

/** tenta bloquear de forma síncrona (SAB + Atomics) quando possível */
function confirmSyncLike(opts) {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  let done = false;

  confirmModal({
    ...DEFAULTS,
    ...opts,
    onResolve: (v) => {
      ia[0] = v ? 1 : 2;
      done = true;
      Atomics.store(ia, 0, ia[0]);
      Atomics.notify(ia, 0);
    },
  });

  while (!done) {
    Atomics.wait(ia, 0, 0);
  }
  return ia[0] === 1;
}

(function install() {
  const original = window.confirm.bind(window);

  if (DEFAULTS.mode === "native") return;

  const confirmAsync = (msgOrOpts) => {
    const opts = typeof msgOrOpts === "string" ? { message: msgOrOpts } : (msgOrOpts || {});
    return confirmModal({ ...DEFAULTS, ...opts });
  };

  if (DEFAULTS.mode === "async") {
    window.confirm = (msgOrOpts) => confirmAsync(msgOrOpts);
    return;
  }

  const canBlock =
    typeof SharedArrayBuffer !== "undefined" &&
    typeof Atomics?.wait === "function" &&
    self.crossOriginIsolated === true;

  if (canBlock) {
    window.confirm = function (msgOrOpts) {
      const opts = typeof msgOrOpts === "string" ? { message: msgOrOpts } : (msgOrOpts || {});
      try {
        return confirmSyncLike(opts);
      } catch {
        // qualquer falha, volta ao nativo
        const msg = typeof msgOrOpts === "object" ? (msgOrOpts?.message || DEFAULTS.message) : (msgOrOpts || DEFAULTS.message);
        return original(msg);
      }
    };
    return;
  }

  // fallback (auto/sync sem isolamento) → usa nativo para não quebrar nada
  window.confirm = function (msgOrOpts) {
    const msg = typeof msgOrOpts === "object" ? (msgOrOpts?.message || DEFAULTS.message) : (msgOrOpts || DEFAULTS.message);
    return original(msg);
  };
})();
