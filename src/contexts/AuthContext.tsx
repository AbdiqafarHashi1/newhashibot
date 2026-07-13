import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { isSupabaseClientEnabled, supabase, supabaseClientConfig, supabaseConfigErrorMessage } from '../lib/supabase';
import { getFrontendSupabaseDebugInfo, getSupabaseClientConfig, logSupabaseEnvProof } from '../lib/supabaseEnv';
import { Profile } from '../lib/types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  lastKnownProfile: Profile | null;
  profileError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface SafeAuthError extends Error {
  status?: number | string;
  code?: string;
  causeMessage?: string;
}

interface AuthActionResult {
  error: SafeAuthError | null;
  profileError?: string | null;
  usedSameSelectedClient?: boolean;
}

function getStringProperty(value: unknown, property: string): string | undefined {
  if (!value || typeof value !== 'object' || !(property in value)) return undefined;
  const propertyValue = (value as Record<string, unknown>)[property];
  if (typeof propertyValue === 'string') return propertyValue;
  if (typeof propertyValue === 'number') return String(propertyValue);
  return undefined;
}

function toSafeAuthError(error: unknown, fallbackMessage = 'Supabase auth failed'): SafeAuthError {
  const source = error instanceof Error ? error : new Error(error ? String(error) : fallbackMessage);
  const safeError = new Error(source.message || fallbackMessage) as SafeAuthError;
  safeError.name = source.name || 'Error';
  safeError.status = getStringProperty(error, 'status');
  safeError.code = getStringProperty(error, 'code');
  const causeValue = error instanceof Error && 'cause' in error
    ? (error as Error & { cause?: unknown }).cause
    : undefined;
  safeError.causeMessage = causeValue instanceof Error
    ? causeValue.message
    : getStringProperty(error, 'cause');
  return safeError;
}


function isAuthFetchFailure(error: unknown): boolean {
  if (!error) return false;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'TypeError'
    || /failed to fetch/i.test(message)
    || /network/i.test(message)
    || /fetch/i.test(message);
}

async function fetchOrCreateProfile(user: User, previousProfile?: Profile | null): Promise<{ profile: Profile | null; error: string | null }> {
  if (!isSupabaseClientEnabled) {
    return { profile: null, error: supabaseConfigErrorMessage ?? 'Supabase frontend config invalid' };
  }

  const fetchPromise = supabase.from('profiles').select('id, email, full_name, role, created_at').eq('id', user.id).maybeSingle();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Profile fetch timed out')), 5000)
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

  if (errMsg) {
    console.error('Failed to load profile:', errMsg);
    if (previousProfile?.id === user.id) {
      return { profile: previousProfile, error: errMsg };
    }
    return { profile: null, error: errMsg };
  }

  if (data) return { profile: data, error: null };

  // Profile missing — trigger may have failed. Insert fallback.
  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('profiles')
      .insert({ id: user.id, email: user.email ?? '', full_name: (user.user_metadata?.full_name as string) ?? '', role: 'user' })
      .select('id, email, full_name, role, created_at')
      .maybeSingle();

    if (insertErr) {
      console.warn('Failed to insert fallback profile, using local state:', insertErr.message);
      return {
        profile: {
          id: user.id,
          email: user.email ?? '',
          full_name: (user.user_metadata?.full_name as string) ?? '',
          role: 'user',
          created_at: new Date().toISOString()
        },
        error: null
      };
    }
    return { profile: inserted as Profile | null, error: null };
  } catch (err) {
    console.warn('Failed to handle missing profile, using memory fallback:', err);
    return {
      profile: {
        id: user.id,
        email: user.email ?? '',
        full_name: (user.user_metadata?.full_name as string) ?? '',
        role: 'user',
        created_at: new Date().toISOString()
      },
      error: null
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lastKnownProfile, setLastKnownProfile] = useState<Profile | null>(null);
  const lastKnownProfileRef = useRef<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Track if initial session resolution has happened to prevent double-loading
  const initializedRef = useRef(false);

  async function loadProfile(u: User): Promise<string | null> {
    const { profile: p, error } = await fetchOrCreateProfile(u, lastKnownProfileRef.current);
    setProfile(p);
    if (p) {
      setLastKnownProfile(p);
      lastKnownProfileRef.current = p;
    }
    setProfileError(error);
    return error;
  }

  async function refreshProfile() {
    if (!isSupabaseClientEnabled) {
      setProfile(null);
      setProfileError(supabaseConfigErrorMessage ?? 'Supabase frontend config invalid');
      return;
    }

    if (user) {
      const { profile: p, error } = await fetchOrCreateProfile(user, lastKnownProfileRef.current);
      setProfile(p);
      if (p) {
        setLastKnownProfile(p);
        lastKnownProfileRef.current = p;
      }
      setProfileError(error);
    }
  }

  useEffect(() => {
    if (!isSupabaseClientEnabled) {
      initializedRef.current = true;
      setSession(null);
      setUser(null);
      setProfile(null);
      setLastKnownProfile(null);
      lastKnownProfileRef.current = null;
      setProfileError(supabaseConfigErrorMessage);
      setLoading(false);
      return;
    }

    // Subscribe to auth state changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, s: Session | null) => {
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
        setLastKnownProfile(null);
        lastKnownProfileRef.current = null;
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

  async function signIn(email: string, password: string): Promise<AuthActionResult> {
    const debug = getFrontendSupabaseDebugInfo();

    logSupabaseEnvProof(debug);

    const config = getSupabaseClientConfig();
    if (!config.hasValidConfig) {
      return {
        error: toSafeAuthError(new Error(config.frontendEnvError ?? 'Supabase frontend config invalid')),
        usedSameSelectedClient: false,
      };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const safeError = toSafeAuthError(error);
        if (isAuthFetchFailure(error) && !safeError.message) {
          safeError.message = 'Supabase auth fetch failed';
        }
        return { error: safeError, usedSameSelectedClient: supabaseClientConfig.supabaseUrl === config.supabaseUrl };
      }

      const postAuthProfileError = data.user ? await loadProfile(data.user) : null;
      return { error: null, profileError: postAuthProfileError, usedSameSelectedClient: supabaseClientConfig.supabaseUrl === config.supabaseUrl };
    } catch (err) {
      return { error: toSafeAuthError(err), usedSameSelectedClient: supabaseClientConfig.supabaseUrl === config.supabaseUrl };
    }
  }

  async function signUp(email: string, password: string, fullName: string) {
    const config = getSupabaseClientConfig();
    if (!config.hasValidConfig) {
      return { error: toSafeAuthError(new Error(config.frontendEnvError ?? 'Supabase frontend config invalid')) };
    }

    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    return { error: error ? toSafeAuthError(error) : null };
  }

  async function signOut() {
    setProfile(null);
    setLastKnownProfile(null);
    lastKnownProfileRef.current = null;
    setProfileError(null);
    if (isSupabaseClientEnabled) {
      await supabase.auth.signOut();
    }
  }

  return (
    <AuthContext.Provider value={{
      user, session, profile, lastKnownProfile, profileError, loading,
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
