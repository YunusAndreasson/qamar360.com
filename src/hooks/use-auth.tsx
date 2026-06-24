import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import type { Session, User } from '@supabase/supabase-js';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** Flips true after the first session resolve, so navigation can gate without flashing. */
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Email a one-time recovery code (tokenless reset — no deep link needed). */
  resetPassword: (email: string) => Promise<void>;
  /** Verify the emailed recovery code; on success a session is established. */
  verifyRecovery: (email: string, code: string) => Promise<void>;
  /** Set a new password for the (recovery-authenticated) user. */
  updatePassword: (password: string) => Promise<void>;
  /** Permanently delete the account and all data, then sign out. */
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Seed from the persisted session, then keep it in sync for the app lifetime.
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitialized(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setInitialized(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initialized,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
      async resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
      },
      async verifyRecovery(email, code) {
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
        if (error) throw error;
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      },
      async deleteAccount() {
        const { error } = await supabase.functions.invoke('delete-account');
        if (error) throw error;
        await supabase.auth.signOut();
      },
    }),
    [session, initialized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
