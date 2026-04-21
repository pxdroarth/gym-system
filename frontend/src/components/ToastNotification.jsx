import { useEffect } from "react";
import { toast } from "react-toastify";

export default function ToastNotification({ message, onClose, duration = 3000 }) {
  useEffect(() => {
    if (!message) return;

    toast.info(message, { autoClose: duration });
    const timer = setTimeout(() => {
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  return null;
}
