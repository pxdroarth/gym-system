import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout() {
  const [sidebarAberta, setSidebarAberta] = useState(true);

  const toggleSidebar = () => {
    setSidebarAberta(prev => !prev);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar sidebarAberta={sidebarAberta} toggleSidebar={toggleSidebar} />

      <div
        className={`flex flex-col flex-grow transition-all duration-300 ${
          sidebarAberta ? "ml-64" : "ml-16"
        }`}
      >
        <Header sidebarAberta={sidebarAberta} />

        <main className="flex-grow p-6 pt-16 bg-gray-100 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

