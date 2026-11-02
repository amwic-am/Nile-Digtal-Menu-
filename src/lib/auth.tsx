import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, TOKEN_KEY } from './api';
import type { StaffUser } from './types';

const SESSION_KEY = 'nile.session';

type StoredSession = { token: string; user: StaffUser };

interface AuthValue {
  user: StaffUser | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<StaffUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(readSession);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setReady(true);
      return;
    }
    api<{ user: StaffUser }>('/auth/me')
      .then((res) => {
        if (cancelled) return;
        const next = { token: session.token, user: res.user };
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
        setSession(next);
      })
      .catch(() => {
        if (!cancelled) logout();
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('nile:unauthorized', onUnauthorized);
    return () => window.removeEventListener('nile:unauthorized', onUnauthorized);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ token: string; user: StaffUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    const next = { token: res.token, user: res.user };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    localStorage.setItem(TOKEN_KEY, res.token);
    setSession(next);
    setReady(true);
    return res.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, token: session?.token ?? null, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
