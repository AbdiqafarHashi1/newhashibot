import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getFrontendSupabaseDebugInfo, getSupabaseClientConfig } from '../lib/supabaseEnv';
import { Profile } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);


function isAuthFetchFailure(error: unknown): boolean {
  if (!error) return false;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'TypeError'
    || /failed to fetch/i.test(message)
    || /network/i.test(message)
    || /fetch/i.test(message);
}

async function fetchOrCreateProfile(user: User): Promise<{ profile: Profile | null; error: string | null }> {
  const fetchPromise = supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Profile fetch timed out')), 10000)
  );

  let data: Profile | null = null;
  let errMsg: string | null = null;

  try {
    const result = await Promise.race([fetchPromise, timeoutPromise]) as Awaited<typeof fetchPromise>;
    if (result.error) errMsg = result.error.message;
    else data = result.data as Profile | null;
  } catch (e) {
    errMsg = (e as Error).message;
  }

  if (errMsg) return { profile: null, error: errMsg };
  if (data) return { profile: data, error: null };

  // Profile missing — trigger may have failed. Insert fallback.
  const { data: inserted, error: insertErr } = await supabase
    .from('profiles')
    .insert({ id: user.id, email: user.email ?? '', full_name: (user.user_metadata?.full_name as string) ?? '', role: 'user' })
    .select('*')
    .maybeSingle();

  if (insertErr) return { profile: null, error: insertErr.message };
  return { profile: inserted as Profile | null, error: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Track if initial session resolution has happened to prevent double-loading
  const initializedRef = useRef(false);

  async function loadProfile(u: User) {
    const { profile: p, error } = await fetchOrCreateProfile(u);
    setProfile(p);
    setProfileError(error);
  }

  async function refreshProfile() {
    if (user) {
      const { profile: p, error } = await fetchOrCreateProfile(user);
      setProfile(p);
      setProfileError(error);
    }
  }

  useEffect(() => {
    // Subscribe to auth state changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        (async () => {
          await loadProfile(s.user!);
          // Mark loading done once we have the session resolved
          if (!initializedRef.current) {
            initializedRef.current = true;
            setLoading(false);
          }
        })();
      } else {
        setProfile(null);
        setProfileError(null);
        if (!initializedRef.current) {
          initializedRef.current = true;
          setLoading(false);
        } else {
          setLoading(false);
        }
      }
    });

    // Also call getSession() as a fallback for cases where onAuthStateChange
    // doesn't fire INITIAL_SESSION quickly enough
    const sessionTimeout = setTimeout(() => {
      if (!initializedRef.current) {
        initializedRef.current = true;
        setLoading(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(sessionTimeout);
    };
  }, []);

  async function signIn(email: string, password: string) {
    const debug = getFrontendSupabaseDebugInfo();

    console.log('[HashiBot Login Debug]', {
      marker: debug.marker,
      selectedUrlOrigin: debug.selectedSupabaseUrlOrigin,
      expectedProjectRef: debug.expectedProjectRef,
      actualProjectRef: debug.actualProjectRef,
      projectRefMatch: debug.projectRefMatches,
      keySource: debug.selectedFrontendKeySource,
      keyPresent: debug.keyPresent,
      keyTypeGuess: debug.keyTypeGuess,
      browserOrigin: debug.browserOrigin,
    });

    const config = getSupabaseClientConfig();
    if (!config.hasValidConfig) {
      return { error: new Error(config.frontendEnvError ?? 'Supabase auth config is invalid') };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (isAuthFetchFailure(error)) {
        return { error: new Error('Supabase auth network/config fetch failed. Check selected URL/key in login debug.') };
      }
      return { error: error as Error | null };
    } catch (err) {
      if (isAuthFetchFailure(err)) {
        return { error: new Error('Supabase auth network/config fetch failed. Check selected URL/key in login debug.') };
      }
      return { error: err as Error };
    }
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    return { error: error as Error | null };
  }

  async function signOut() {
    setProfile(null);
    setProfileError(null);
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{
      user, session, profile, profileError, loading,
      signIn, signUp, signOut, refreshProfile,
      isAdmin: profile?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
