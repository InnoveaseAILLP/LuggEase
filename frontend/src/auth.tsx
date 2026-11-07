import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, loadToken, setToken, setUnauthorizedHandler } from "@/src/api";
import { loadEnv } from "@/src/env";
import { queryClient } from "@/src/query-client";
import type { Role, User } from "@/src/types";

WebBrowser.maybeCompleteAuthSession();

type AuthValue = {
  user: User | null;
  loading: boolean;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (name: string, email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  setRole: (role: Exclude<Role, "admin">, phone?: string) => Promise<void>;
  setUser: (u: User) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthValue | null>(null);

const extractSession = (url: string) => url.match(/[?#&]session_id=([^&#]+)/)?.[1] ?? null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sent = useRef(new Set<string>());

  const exchange = useCallback(async (sid: string) => {
    if (sent.current.has(sid)) return false;
    sent.current.add(sid);
    const r = await api<{ session_token: string; user: User }>("/auth/session", { body: { session_id: sid } });
    await setToken(r.session_token);
    setUserState(r.user);
    return true;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUserState(null));
    (async () => {
      try {
        await loadEnv();
        if (Platform.OS === "web") {
          const sid = extractSession(window.location.href);
          if (sid) {
            await exchange(sid);
            const url = new URL(window.location.href);
            url.searchParams.delete("session_id");
            url.hash = url.hash.replace(/session_id=[^&]+&?/, "").replace(/^#$/, "");
            window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
            return;
          }
        } else {
          const init = await Linking.getInitialURL();
          const sid = init ? extractSession(init) : null;
          if (sid) {
            await exchange(sid);
            return;
          }
        }
        const t = await loadToken();        if (t) {
          try {
            setUserState(await api<User>("/auth/me"));
          } catch {
            await setToken(null);
            setUserState(null);
          }
        }
      } catch {
        setUserState(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [exchange]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const sid = extractSession(url);
      if (sid) exchange(sid).catch(() => {});
    });
    return () => sub.remove();
  }, [exchange]);

  const loginEmail = async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", { body: { email, password } });
    await setToken(r.token);
    setUserState(r.user);
  };

  const registerEmail = async (name: string, email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/register", { body: { name, email, password } });
    await setToken(r.token);
    setUserState(r.user);
  };

  const loginGoogle = async () => {
    if (Platform.OS === "web") {
      const redirect = window.location.origin + "/";
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    const redirect = Linking.createURL("");
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      captured = url;
    });
    try {
      const res = await WebBrowser.openAuthSessionAsync(
        `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`,
        redirect,
      );
      const url = (res.type === "success" ? res.url : null) || captured || (await Linking.getInitialURL());
      const sid = url ? extractSession(url) : null;
      if (sid) await exchange(sid);
    } finally {
      sub.remove();
    }
  };

  const setRole = async (role: Exclude<Role, "admin">, phone?: string) => {
    setUserState(await api<User>("/auth/role", { body: { role, phone: phone || undefined } }));
  };

  const refresh = async () => {
    setUserState(await api<User>("/auth/me"));
  };

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    await setToken(null);
    queryClient.clear();
    setUserState(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, loginEmail, registerEmail, loginGoogle, setRole, setUser: setUserState, refresh, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("useAuth outside provider");
  return v;
}
