import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { isDevAutoLoginEnabled, getDevLoginCredentials } from "../utils/devAutoLogin";
import { loginRequest, logoutRequest, meRequest } from "../services/authService";
import {
  clearAuthStorage,
  getAuthToken,
  getStoredUser,
  setAuthToken,
  setStoredUser,
  updateStoredUser,
} from "../utils/authStorage";

export const AuthContext = createContext(null);

function unwrapData(payload) {
  return payload?.data ?? payload ?? null;
}

export function AuthProvider({ children }) {
  const storedUser = getStoredUser();

  const [token, setToken] = useState(() => getAuthToken());
  const [user, setUser] = useState(() => storedUser);
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(() => storedUser?.tenant || null);
  const [currentUnit, setCurrentUnit] = useState(() => storedUser?.currentUnit || null);
  const [allowedUnits, setAllowedUnits] = useState(() => storedUser?.allowedUnits || []);
  const [scopeVersion, setScopeVersion] = useState(0);

  const applyUserScope = useCallback((resolvedUser, preferredUnitId = null) => {
    const units = Array.isArray(resolvedUser?.allowedUnits) ? resolvedUser.allowedUnits : [];

    const preferredUnit = preferredUnitId
      ? units.find((unit) => Number(unit.id) === Number(preferredUnitId))
      : null;

    const resolvedCurrentUnit =
      preferredUnit || resolvedUser?.currentUnit || units[0] || null;

    const resolvedTenant =
      resolvedUser?.tenant ||
      (resolvedCurrentUnit ? { id: resolvedCurrentUnit.tenant_id } : null);

    setTenant(resolvedTenant);
    setCurrentUnit(resolvedCurrentUnit);
    setAllowedUnits(units);

    return resolvedUser
      ? {
          ...resolvedUser,
          tenant: resolvedTenant,
          currentUnit: resolvedCurrentUnit,
          allowedUnits: units,
        }
      : null;
  }, []);

  const clearSession = useCallback(() => {
    clearAuthStorage();
    setToken(null);
    setUser(null);
    setTenant(null);
    setCurrentUnit(null);
    setAllowedUnits([]);
    setScopeVersion((version) => version + 1);
  }, []);

  const refreshMe = useCallback(async () => {
    const currentToken = getAuthToken();

    if (!currentToken) {
      clearSession();
      return null;
    }

    const raw = await meRequest();
    const data = unwrapData(raw);

    const storedUnitId = getStoredUser()?.currentUnit?.id || null;
    const resolvedUser = applyUserScope(data, storedUnitId);

    setUser(resolvedUser);
    setStoredUser(resolvedUser);

    return resolvedUser;
  }, [applyUserScope, clearSession]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading(true);

      try {
        let currentToken = getAuthToken();

        if (!currentToken && isDevAutoLoginEnabled()) {
          const credentials = getDevLoginCredentials();

          if (credentials.login && credentials.senha) {
            const rawLogin = await loginRequest(credentials);
            const loginData = unwrapData(rawLogin);

            if (loginData?.token) {
              setAuthToken(loginData.token);
              currentToken = loginData.token;

              const resolvedUserFromLogin = applyUserScope(loginData?.usuario || null);
              setStoredUser(resolvedUserFromLogin);
              setToken(loginData.token);
              setUser(resolvedUserFromLogin);
            }
          }
        }

        if (!currentToken) {
          clearSession();
          return;
        }

        const resolvedUser = await refreshMe();
        if (!active) return;

        setToken(currentToken);
        setUser(resolvedUser);
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setLoading(false);
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, [applyUserScope, clearSession, refreshMe]);

  const login = useCallback(
    async ({ login, senha }) => {
      const raw = await loginRequest({ login, senha });
      const data = unwrapData(raw);

      setAuthToken(data?.token || null);

      const resolvedUser = applyUserScope(data?.usuario || null);
      setStoredUser(resolvedUser);

      setToken(data?.token || null);
      setUser(resolvedUser);

      return data;
    },
    [applyUserScope]
  );

  const setActiveUnit = useCallback(
    (unitId) => {
      const unit = allowedUnits.find((item) => Number(item.id) === Number(unitId));

      if (!unit) {
        throw new Error("Unidade não disponível para este usuário.");
      }

      setCurrentUnit(unit);
      setTenant(unit.tenant_id ? { id: unit.tenant_id } : tenant);
      setScopeVersion((version) => version + 1);

      const nextUser = updateStoredUser((stored) => ({
        ...stored,
        tenant: unit.tenant_id ? { id: unit.tenant_id } : stored?.tenant,
        currentUnit: unit,
        allowedUnits,
      }));

      if (nextUser) {
        setUser(nextUser);
      }

      return unit;
    },
    [allowedUnits, tenant]
  );

  const logout = useCallback(async () => {
    try {
      if (getAuthToken()) {
        await logoutRequest();
      }
    } catch {
      // mesmo se falhar no backend, encerra localmente
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      tenant,
      currentUnit,
      allowedUnits,
      scopeVersion,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
      setActiveUnit,
      refreshMe,
      clearSession,
    }),
    [
      token,
      user,
      loading,
      tenant,
      currentUnit,
      allowedUnits,
      scopeVersion,
      login,
      logout,
      setActiveUnit,
      refreshMe,
      clearSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}