import {createContext, ReactNode, useContext, useEffect, useState} from 'react';
import {api, setTokenProvider, setUnauthorizedHandler} from '@/src/api';
import {loadEnv} from '@/src/env';
import {identity} from '@/src/firebase';
import {queryClient} from '@/src/query-client';
import type {Role, User} from '@/src/types';
import {validateCredentials} from '@/src/auth-validation';

type AuthValue = {
  user: User | null; loading: boolean;
  entryRole: Role | null; setEntryRole: (role: Role | null) => void;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (name: string, email: string, password: string) => Promise<void>;
  loginGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  completeVerification: () => Promise<void>;
  setRole: (role: Exclude<Role, 'admin'>, phone?: string) => Promise<void>;
  setUser: (user: User) => void; refresh: () => Promise<void>; logout: () => Promise<void>;
};
const AuthCtx = createContext<AuthValue | null>(null);
setTokenProvider(() => identity.token());
export function AuthProvider({children}: {children: ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // A login preference preselects onboarding; only the API profile grants access.
  const [entryRole, setEntryRole] = useState<Role | null>(null);
  useEffect(() => {
    let active = true;
    let version = 0;
    setUnauthorizedHandler(() => { setUser(null); queryClient.clear(); });
    const stop = identity.subscribe(async () => {
      const request = ++version;
      try {
        await loadEnv();
        const profile = identity.current()?.emailVerified ? await api<User>('/auth/firebase/session', {method:'POST'}) : null;
        if (active && version === request) { queryClient.clear(); setUser(profile); }
      } catch { if (active && version === request) setUser(null); }
      finally { if (active && version === request) setLoading(false); }
    });
    return () => { active = false; stop(); setUnauthorizedHandler(null); };
  }, []);
  async function refresh() {
    const uid = identity.current()?.uid;
    const profile = await api<User>('/auth/firebase/session', {method:'POST'});
    if (uid && identity.current()?.uid === uid) setUser(profile);
  }
  async function completeVerification() {
    await identity.refresh();
    if (!identity.current()?.emailVerified) throw new Error('Open the verification link in your email, then continue.');
    await identity.token(true);
    await refresh();
  }
  async function loginEmail(email: string, password: string) {
    validateCredentials(email, password);
    await identity.login(email.trim().toLowerCase(), password);
    if (!identity.current()?.emailVerified) throw new Error('Please verify your email before signing in.');
    await refresh();
  }
  async function registerEmail(name: string, email: string, password: string) {
    validateCredentials(email, password, name);
    await identity.register(name.trim(), email.trim().toLowerCase(), password);
  }
  async function loginGoogle() { await identity.google(); await completeVerification(); }
  async function resetPassword(email: string) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address.');
    try { await identity.reset(email.trim().toLowerCase()); }
    catch (error: any) { if (error.code !== 'auth/user-not-found') throw error; }
  }
  async function logout() {
    await identity.logout();
    queryClient.clear();
    setEntryRole(null);
    if (!identity.current()) setUser(null);
  }
  async function setRole(role: Exclude<Role, 'admin'>, phone?: string) {
    const uid = identity.current()?.uid;
    const profile = await api<User>('/auth/role', {body:{role, phone:phone || undefined}});
    if (uid && identity.current()?.uid === uid) setUser(profile);
  }
  return <AuthCtx.Provider value={{user,loading,entryRole,setEntryRole,loginEmail,registerEmail,loginGoogle,resetPassword,resendVerification:identity.verify,completeVerification,setRole,setUser,refresh,logout}}>{children}</AuthCtx.Provider>;
}
export function useAuth() { const value = useContext(AuthCtx); if (!value) throw new Error('useAuth outside provider'); return value; }
