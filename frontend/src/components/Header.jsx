import React from "react";
import { Bell, Menu, Search } from "lucide-react";
import UnitScopeSelector from "./layout/UnitScopeSelector";
import UserMenu from "./layout/UserMenu";

export default function Header({ sidebarAberta, toggleSidebar }) {
  return (
    <header className={`app-topbar ${sidebarAberta ? "app-topbar--expanded" : "app-topbar--collapsed"}`}>
      <div className="app-topbar__left">
        <button
          onClick={toggleSidebar}
          className="app-topbar__button"
          title={sidebarAberta ? "Recolher menu" : "Expandir menu"}
          type="button"
        >
          <Menu size={20} />
        </button>

        <div className="app-topbar__brand">
          <span className="app-topbar__eyebrow">Plataforma operacional</span>
          <span className="app-topbar__title">Academia SA</span>
        </div>
      </div>

      <div className="app-topbar__right">
        <button className="app-topbar__button app-topbar__button--decorative" title="Busca global em evolução" type="button">
          <Search size={17} />
        </button>
        <button className="app-topbar__button app-topbar__button--decorative" title="Notificações em evolução" type="button">
          <Bell size={17} />
        </button>
        <UnitScopeSelector />
        <UserMenu />
      </div>
    </header>
  );
}
