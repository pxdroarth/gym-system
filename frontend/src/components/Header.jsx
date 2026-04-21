import React from "react";
import { Bell, Menu, Search } from "lucide-react";

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

        <span className="app-topbar__title">SA - Gestão Academia</span>
      </div>

      <div className="app-topbar__right">
        <button className="app-topbar__button" title="Buscar" type="button">
          <Search size={17} />
        </button>
        <button className="app-topbar__button" title="Notificações" type="button">
          <Bell size={17} />
        </button>
        <div className="app-topbar__user">
          <div className="app-topbar__avatar">SA</div>
          <span className="app-topbar__user-name">SA AGFIT</span>
        </div>
      </div>
    </header>
  );
}
