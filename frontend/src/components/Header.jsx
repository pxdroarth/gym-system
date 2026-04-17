import React from "react";
import { Menu } from "lucide-react"; // ícone elegante opcional

export default function Header({ sidebarAberta, toggleSidebar }) {
  return (
    <header
      className={`fixed top-0 ${
        sidebarAberta ? "left-64" : "left-16"
      } right-0 h-16 bg-blue-800 text-white flex items-center justify-between px-4 sm:px-6 shadow-md z-40 transition-all duration-300`}
    >
      {/* Botão de retração da sidebar */}
      <div className="flex items-center space-x-4">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-white"
          title={sidebarAberta ? "Recolher menu" : "Expandir menu"}
        >
          {/* Ícone usando Lucide, se disponível, ou texto alternativo: */}
          <Menu size={24} />
          {/* Ou substitua por: <span className="text-xl font-bold">☰</span> */}
        </button>

        {/* Título (oculto em telas menores) */}
        <span className="text-lg sm:text-xl font-semibold hidden sm:inline-block">
          SA - Gestão Academia
        </span>
      </div>

      {/* Ações do usuário */}
      <div className="flex items-center space-x-4">
        <button
          className="hover:bg-blue-700 rounded-full p-2 transition duration-200"
          title="Buscar"
        >
          🔍
        </button>
        <button
          className="hover:bg-blue-700 rounded-full p-2 transition duration-200"
          title="Notificações"
        >
          🔔
        </button>
        <div className="flex items-center space-x-2 cursor-pointer">
          <img
            src="/user-avatar.png"
            alt="Usuário"
            className="w-9 h-9 rounded-full border-2 border-white"
          />
          <span className="hidden sm:inline font-medium">SA AGFIT</span>
        </div>
      </div>
    </header>
  );
}
