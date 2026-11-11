import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, TOKEN_KEY } from './api';
import { supabase } from './supabase';
import type { StaffUser } from './types';

type StoredSession = { token: string; user: StaffUser };

interface AuthValue {
  user: StaffUser | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<StaffUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    void supabase.auth.signOut().then(({ error }) => {
      if (error) console.error('[nile] could not sign out of Supabase Auth:', error);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, authSession) => {
      if (authSession) {
        localStorage.setItem(TOKEN_KEY, authSession.access_token);
        setSession((current) => current ? { ...current, token: authSession.access_token } : current);
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setSession(null);
      }
    });

    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) return;

        localStorage.setItem(TOKEN_KEY, data.session.access_token);
        const res = await api<{ user: StaffUser }>('/auth/me');
        if (cancelled) return;
        setSession({ token: data.session.access_token, user: res.user });
      } catch (error) {
        if (!cancelled) {
          console.error('[nile] could not restore Supabase Auth session:', error);
          await supabase.auth.signOut();
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('nile:unauthorized', onUnauthorized);
    return () => window.removeEventListener('nile:unauthorized', onUnauthorized);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('Supabase Auth did not return a session.');

    localStorage.setItem(TOKEN_KEY, data.session.access_token);
    let res: { user: StaffUser };
    try {
      res = await api<{ user: StaffUser }>('/auth/me');
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    }

    const next = { token: data.session.access_token, user: res.user };
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
