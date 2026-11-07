import React from "react";
import { Menu } from "lucide-react";
import UnitScopeSelector from "./layout/UnitScopeSelector";
import UserMenu from "./layout/UserMenu";

export default function Header({ compacto, sidebarAberta, menuExpandido, toggleSidebar, botaoMenuRef }) {
  const posicao = compacto ? "app-topbar--compact" : sidebarAberta ? "app-topbar--expanded" : "app-topbar--collapsed";
  let titulo = sidebarAberta ? "Recolher menu" : "Expandir menu";
  if (compacto) titulo = menuExpandido ? "Fechar menu" : "Abrir menu";

  return (
    <header className={`app-topbar ${posicao}`}>
      <div className="app-topbar__left">
        <button
          ref={botaoMenuRef}
          onClick={toggleSidebar}
          className="app-topbar__button"
          title={titulo}
          aria-label={titulo}
          aria-expanded={menuExpandido}
          aria-controls="app-sidebar"
          type="button"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        {compacto && <span className="app-topbar__title">Academia SA</span>}
      </div>

      <div className="app-topbar__right">
        <UnitScopeSelector />
        <UserMenu />
      </div>
    </header>
  );
}
