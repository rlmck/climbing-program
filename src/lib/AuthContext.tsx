import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getOwnAthlete } from './api';
import type { AthleteRow } from './db';

interface AuthState {
  loading: boolean;
  session: Session | null;
  athlete: AthleteRow | null;
  /** Coach-capable users can flip between "my training" and "coach view". */
  coachView: boolean;
  setCoachView: (on: boolean) => void;
  /** True after arriving via a password-recovery link, until a new password is set. */
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
  refreshAthlete: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [athlete, setAthlete] = useState<AthleteRow | null>(null);
  const [coachView, setCoachView] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const loadAthlete = useCallback(async (s: Session | null) => {
    if (!s?.user) {
      setAthlete(null);
      return;
    }
    try {
      setAthlete(await getOwnAthlete(s.user.id));
    } catch {
      setAthlete(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadAthlete(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
      setSession(s);
      await loadAthlete(s);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadAthlete]);

  const refreshAthlete = useCallback(async () => loadAthlete(session), [loadAthlete, session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  const value = useMemo(
    () => ({
      loading,
      session,
      athlete,
      coachView,
      setCoachView,
      passwordRecovery,
      clearPasswordRecovery,
      refreshAthlete,
      signOut,
    }),
    [loading, session, athlete, coachView, passwordRecovery, clearPasswordRecovery, refreshAthlete, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
