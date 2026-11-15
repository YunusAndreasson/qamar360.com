import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { ANALYTICS_EVENTS } from '@/constants/analytics';
import { analytics } from '@/lib/analytics';
import * as socialAuth from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';

import type { Session, User } from '@supabase/supabase-js';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** Flips true after the first session resolve, so navigation can gate without flashing. */
  initialized: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  /** Native Sign in with Apple (ID-token flow). No-op if the user cancels. */
  signInWithApple: () => Promise<void>;
  /** Native Sign in with Google (ID-token flow). No-op if the user cancels. */
  signInWithGoogle: () => Promise<void>;
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
    let settled = false;
    const finish = (next: Session | null) => {
      if (settled) return;
      settled = true;
      setSession(next);
      setInitialized(true);
    };

    // Seed from the persisted session. getSession() reads the SQLite-backed storage
    // and may run a token refresh; on the new architecture that path can intermittently
    // HANG (never resolving or rejecting), which would freeze the launch on the gate
    // since `.finally()` would never run. So drive `initialized` through `finish()`,
    // guarded by a safety-net timeout: if the session hasn't resolved shortly, proceed
    // as signed-out (a real session still arrives later via onAuthStateChange).
    void supabase.auth.getSession().then(({ data }) => finish(data.session)).catch(() => finish(null));
    const timeout = setTimeout(() => finish(null), 2500);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      settled = true;
      setSession(nextSession);
      setInitialized(true);
    });

    return () => {
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initialized,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void analytics.trackSignIn('email');
      },
      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        void analytics.trackSignUp('email');
      },
      // Native social sign-in lands a session that flows through the onAuthStateChange listener
      // above, so these just delegate — no manual navigation. `public.users` is provisioned by the
      // `handle_new_user` DB trigger (and `ensureUserRow` on first write), same as any signup.
      // Analytics: a plain event with the method only, never who; nothing on a cancel.
      async signInWithApple() {
        if (await socialAuth.signInWithApple()) void analytics.trackSignIn('apple');
      },
      async signInWithGoogle() {
        if (await socialAuth.signInWithGoogle()) void analytics.trackSignIn('google');
      },
      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        // A fresh anonymous id, so the next account on this device does not inherit this one's.
        void analytics.trackSignOut().then(() => analytics.reset());
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
        // After the deletion has gone through, and never able to fail it: analytics never throws.
        void analytics.track(ANALYTICS_EVENTS.ACCOUNT_DELETED).then(() => analytics.reset());
      },
    }),
    [session, initialized],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
