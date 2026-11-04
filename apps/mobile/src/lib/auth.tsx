import type { Session } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CONSENT_SCOPE, NOTICE_VERSION } from '@/lib/consent';
import { secureStorage } from '@/lib/secure-storage';
import { supabase } from '@/lib/supabase';

export interface Account {
  displayName: string | null;
  phone: string | null;
  /** The user's current business; a person belongs to one in Version 0's screens. */
  business: { id: string; name: string; role: string } | null;
  /** Whether this person has agreed to the current data notice. */
  consented: boolean;
}

/**
 * loading: working out who is signed in.
 * signed_out: show sign-in.
 * unavailable: signed in, but the account could not be read and no copy is saved.
 * ready: `account` is filled in.
 */
type AuthStatus = 'loading' | 'signed_out' | 'unavailable' | 'ready';

interface AuthState {
  status: AuthStatus;
  userId: string | null;
  account: Account | null;
  /** Reads the account again, for example after creating or joining a business. */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ACCOUNT_KEY = 'dt.account';

async function fetchAccount(userId: string): Promise<Account> {
  const profile = await supabase.from('profiles').select('display_name, phone').eq('id', userId).single();
  if (profile.error) throw profile.error;
  const memberships = await supabase
    .from('memberships')
    .select('role, business_id, joined_at, businesses(name)')
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('joined_at', { ascending: false })
    .limit(1);
  if (memberships.error) throw memberships.error;
  const consents = await supabase
    .from('consents')
    .select('id')
    .eq('user_id', userId)
    .eq('scope', CONSENT_SCOPE)
    .eq('notice_version', NOTICE_VERSION)
    .limit(1);
  if (consents.error) throw consents.error;
  const row = memberships.data[0] as unknown as
    | { role: string; business_id: string; businesses: { name: string } | null }
    | undefined;
  return {
    displayName: profile.data.display_name,
    phone: profile.data.phone,
    business: row ? { id: row.business_id, name: row.businesses?.name ?? '', role: row.role } : null,
    consented: consents.data.length > 0,
  };
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [account, setAccount] = useState<Account | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    // Fires straight away with the saved session, then on every sign-in and sign-out.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (id: string, isCurrent: () => boolean = () => true) => {
    try {
      const fresh = await fetchAccount(id);
      if (!isCurrent()) return;
      setAccount(fresh);
      setUnavailable(false);
      await secureStorage.setItem(ACCOUNT_KEY, JSON.stringify({ userId: id, account: fresh }));
    } catch {
      // No signal must not lock a driver out, so fall back to the saved copy.
      const saved = await secureStorage.getItem(ACCOUNT_KEY);
      if (!isCurrent()) return;
      const parsed = saved ? (JSON.parse(saved) as { userId: string; account: Account }) : null;
      if (parsed?.userId === id) {
        // A copy saved before consent existed must not lock a driver out with no signal; the next good read corrects it.
        setAccount({ ...parsed.account, consented: parsed.account.consented ?? true });
        setUnavailable(false);
      } else {
        setUnavailable(true);
      }
    }
  }, []);

  useEffect(() => {
    setAccount(null);
    setUnavailable(false);
    if (!userId) return;
    let current = true;
    void load(userId, () => current);
    return () => {
      current = false;
    };
  }, [userId, load]);

  const value = useMemo<AuthState>(() => {
    let status: AuthStatus = 'loading';
    if (session === null) status = 'signed_out';
    else if (account) status = 'ready';
    else if (unavailable) status = 'unavailable';
    return {
      status,
      userId,
      account,
      refresh: async () => {
        if (userId) await load(userId);
      },
      signOut: async () => {
        await secureStorage.removeItem(ACCOUNT_KEY);
        // The saved copy of this person's business goes too. Unsent entries stay, to send when they sign back in.
        if (userId) {
          const keys = await Storage.getAllKeys();
          await Storage.multiRemove(keys.filter((key) => key.startsWith(`dt.driver-overview.${userId}.`)));
        }
        // Local, so signing out works with no signal.
        await supabase.auth.signOut({ scope: 'local' });
      },
    };
  }, [session, account, unavailable, userId, load]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
