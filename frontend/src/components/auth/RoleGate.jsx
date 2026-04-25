import React from "react";
import useAuth from "../../hooks/useAuth";
import { userHasUiPermission } from "../../utils/permissions";

export default function RoleGate({ permission, fallback = null, children }) {
  const { user } = useAuth();

  if (!permission || userHasUiPermission(user, permission)) {
    return <>{children}</>;
  }

  return fallback;
}
