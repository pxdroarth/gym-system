import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout() {
  const [sidebarAberta, setSidebarAberta] = useState(true);

  const toggleSidebar = () => {
    setSidebarAberta((prev) => !prev);
  };

  return (
    <div className="app-shell">
      <Sidebar aberta={sidebarAberta} />

      <div className={`app-main ${sidebarAberta ? "app-main--expanded" : "app-main--collapsed"}`}>
        <Header sidebarAberta={sidebarAberta} toggleSidebar={toggleSidebar} />

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
