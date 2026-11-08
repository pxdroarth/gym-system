import { useEffect, useRef } from "react";
import { toast } from "react-toastify";

export default function ToastNotification({ message, onClose, duration = 3000 }) {
  // onClose costuma vir como funcao inline (nova a cada render). Guardado em
  // ref para que um re-render da pagina nao repita o mesmo toast.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!message) return;

    toast.info(message, { autoClose: duration });
    const timer = setTimeout(() => {
      onCloseRef.current?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration]);

  return null;
}
