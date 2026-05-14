import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { isDevAutoLoginEnabled, getDevLoginCredentials } from "../utils/devAutoLogin";
import { getApiErrorMessage } from "../utils/getApiErrorMessage";
import { setAuthFailureHandler } from "../services/Api";
import { loginRequest, logoutRequest, meRequest, refreshSession } from "../services/authService";
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
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [currentUnit, setCurrentUnit] = useState(null);
  const [allowedUnits, setAllowedUnits] = useState([]);
  const [scopeVersion, setScopeVersion] = useState(0);

  const applyUserScope = useCallback((resolvedUser, preferredUnitId = null, options = {}) => {
    const units = Array.isArray(resolvedUser?.allowedUnits) ? resolvedUser.allowedUnits : [];
    const shouldCommit = options.commit !== false;

    const preferredUnit = preferredUnitId
      ? units.find((unit) => Number(unit.id) === Number(preferredUnitId))
      : null;

    const resolvedCurrentUnit =
      preferredUnit || resolvedUser?.currentUnit || units[0] || null;

    const resolvedTenant =
      resolvedUser?.tenant ||
      (resolvedCurrentUnit ? { id: resolvedCurrentUnit.tenant_id } : null);

    if (shouldCommit) {
      setTenant(resolvedTenant);
      setCurrentUnit(resolvedCurrentUnit);
      setAllowedUnits(units);
    }

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

  const commitAuthenticatedSession = useCallback(
    (nextToken, nextUser) => {
      if (!nextToken || !nextUser) {
        clearSession();
        return null;
      }

      setAuthToken(nextToken);
      setStoredUser(nextUser);
      setToken(nextToken);
      setUser(nextUser);
      setTenant(nextUser.tenant || null);
      setCurrentUnit(nextUser.currentUnit || null);
      setAllowedUnits(Array.isArray(nextUser.allowedUnits) ? nextUser.allowedUnits : []);

      return nextUser;
    },
    [clearSession]
  );

  const refreshMe = useCallback(async () => {
    const currentToken = getAuthToken();

    if (!currentToken) {
      clearSession();
      return null;
    }

    const raw = await meRequest({ skipAuthRefresh: true });
    const data = unwrapData(raw);

    const storedUnitId = getStoredUser()?.currentUnit?.id || null;
    const resolvedUser = applyUserScope(data, storedUnitId, { commit: false });

    return {
      token: currentToken,
      user: resolvedUser,
    };
  }, [applyUserScope, clearSession]);

  const applyAuthData = useCallback(
    (authData, preferredUnitId = null) => {
      if (!authData?.token) {
        return null;
      }

      setAuthToken(authData.token);

      const resolvedUser = applyUserScope(authData?.usuario || null, preferredUnitId);
      setStoredUser(resolvedUser);

      setToken(authData.token);
      setUser(resolvedUser);

      return resolvedUser;
    },
    [applyUserScope]
  );

  const tryRefreshSession = useCallback(async () => {
    const storedUnitId = getStoredUser()?.currentUnit?.id || null;
    const refreshed = await refreshSession();
    const resolvedUser = applyUserScope(refreshed?.usuario || null, storedUnitId, { commit: false });
    if (!refreshed?.token || !resolvedUser) {
      clearSession();
      throw new Error("Refresh nao retornou sessao valida.");
    }
    return {
      token: refreshed?.token || null,
      user: resolvedUser,
    };
  }, [applyUserScope, clearSession]);

  useEffect(() => {
    setAuthFailureHandler(clearSession);
    return () => setAuthFailureHandler(null);
  }, [clearSession]);

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
              currentToken = loginData.token;

              const resolvedUserFromLogin = applyUserScope(loginData?.usuario || null, null, { commit: false });
              if (active) {
                commitAuthenticatedSession(loginData.token, resolvedUserFromLogin);
              }
            }
          }
        }

        if (!currentToken) {
          const refreshed = await tryRefreshSession();
          if (!active) return;
          commitAuthenticatedSession(refreshed.token, refreshed.user);
          return;
        }

        let resolved = null;
        try {
          resolved = await refreshMe();
        } catch {
          resolved = await tryRefreshSession();
        }

        if (!active) return;

        commitAuthenticatedSession(resolved.token, resolved.user);
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
  }, [applyUserScope, clearSession, commitAuthenticatedSession, refreshMe, tryRefreshSession]);

  const login = useCallback(
    async ({ login, senha }) => {
      try {
        const raw = await loginRequest({ login, senha });
        const data = unwrapData(raw);

        applyAuthData(data);

        return data;
      } catch (error) {
        throw new Error(getApiErrorMessage(error));
      }
    },
    [applyAuthData]
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
