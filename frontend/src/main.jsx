import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';  // Importa o CSS global aqui

// ✅ registra o polyfill global do confirm
import "./confirm/setupConfirmPolyfill";

// React 18 usa createRoot para renderizar
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

