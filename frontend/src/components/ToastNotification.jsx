import React, { useEffect } from "react";

export default function ToastNotification({ message, onClose, duration = 3000 }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [message, duration, onClose]);

  if (!message) return null;

  return (
    <div
      className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow-lg cursor-pointer"
      onClick={onClose}
      role="alert"
      aria-live="assertive"
    >
      {message}
    </div>
  );
}
