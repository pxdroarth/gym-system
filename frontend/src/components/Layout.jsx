import React, { useCallback, useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import useMediaQuery, { COMPACT_SHELL_QUERY } from "../hooks/useMediaQuery";

// Desktop: menu lateral fixo (recolhivel pelo botao do topo).
// Abaixo de 1024 px: o mesmo menu vira gaveta aberta pelo botao do topo.
export default function Layout() {
  const compacto = useMediaQuery(COMPACT_SHELL_QUERY);
  const [sidebarAberta, setSidebarAberta] = useState(true);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const botaoMenuRef = useRef(null);
  const location = useLocation();

  const fecharGaveta = useCallback((devolverFoco = false) => {
    setGavetaAberta(false);
    if (devolverFoco) botaoMenuRef.current?.focus();
  }, []);

  // Navegar ou voltar ao desktop fecha a gaveta.
  useEffect(() => {
    setGavetaAberta(false);
  }, [location.pathname, compacto]);

  useEffect(() => {
    if (!gavetaAberta) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") fecharGaveta(true);
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [gavetaAberta, fecharGaveta]);

  const toggleMenu = () => {
    if (compacto) setGavetaAberta((prev) => !prev);
    else setSidebarAberta((prev) => !prev);
  };

  const menuExpandido = compacto ? gavetaAberta : sidebarAberta;
  const mainClass = compacto
    ? "app-main--compact"
    : sidebarAberta ? "app-main--expanded" : "app-main--collapsed";

  return (
    <div className={`app-shell ${compacto ? "app-shell--compact" : ""}`}>
      <Sidebar
        aberta={compacto ? true : sidebarAberta}
        compacto={compacto}
        gavetaAberta={gavetaAberta}
        onFechar={() => fecharGaveta(true)}
      />
      {compacto && gavetaAberta && (
        <div className="app-drawer-backdrop" onClick={() => fecharGaveta(true)} aria-hidden="true" />
      )}

      <div className={`app-main ${mainClass}`}>
        <Header
          compacto={compacto}
          sidebarAberta={sidebarAberta}
          menuExpandido={menuExpandido}
          toggleSidebar={toggleMenu}
          botaoMenuRef={botaoMenuRef}
        />

        <main className="app-content" role="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
