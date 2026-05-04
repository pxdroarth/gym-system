import React from "react";
import { LogOut } from "lucide-react";
import Button from "../ui/Button";
import useAuth from "../../hooks/useAuth";
import { getRoleLabel } from "../../utils/permissions";

function initials(name) {
  return String(name || "SA")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="app-topbar__user">
      <div className="app-topbar__avatar">{initials(user?.nome || user?.login)}</div>
      <div className="hidden sm:block leading-tight">
        <div className="app-topbar__user-name">{user?.nome || user?.login || "Operador"}</div>
        <div className="text-[0.65rem] text-slate-500 font-semibold">{getRoleLabel(user?.papel)}</div>
      </div>
      <Button variant="ghost" size="sm" onClick={logout} title="Sair" className="border-transparent">
        <LogOut size={14} />
      </Button>
    </div>
  );
}
