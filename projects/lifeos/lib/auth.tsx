"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/*
  Auth abstraction.

  MVP default: a local, zero-config session backed by localStorage so the
  dashboard is reachable with no keys at all. Production swaps in Clerk
  (preferred per the tool library) — the integration points are marked
  TODO(keys) and documented in SETUP-KEYS.md. When
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is present, replace this provider's
  internals with Clerk's <ClerkProvider> + useUser()/useAuth() hooks; the
  surface (useAuth) stays identical so no callsite changes.
*/

export interface AuthUser {
  name: string;
  email: string;
}

interface AuthApi {
  user: AuthUser | null;
  ready: boolean;
  signIn: (u: AuthUser) => void;
  signOut: () => void;
}

const KEY = "lifeos:auth:v1";
const AuthCtx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);

  const signIn = useCallback((u: AuthUser) => {
    setUser(u);
    try {
      localStorage.setItem(KEY, JSON.stringify(u));
    } catch {}
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }, []);

  const api = useMemo<AuthApi>(
    () => ({ user, ready, signIn, signOut }),
    [user, ready, signIn, signOut],
  );

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
