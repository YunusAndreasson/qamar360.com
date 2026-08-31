import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

import { getSupabaseServerClient } from '#/lib/supabase/server'

/**
 * The verified current user, resolved from the request's session cookie. Always runs on the
 * server (even when a route's `beforeLoad` fires during a client-side navigation), so route guards
 * can trust it. Returns null when there is no valid session.
 *
 * The one place that shape is defined, so the two server fns below cannot drift apart on what
 * "the signed-in user" means.
 */
async function currentUser() {
  const supabase = getSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
}

/** The current user on its own — the auth guard used by `login` and the index redirect. */
export const getUserFn = createServerFn({ method: 'GET' }).handler(currentUser)

/**
 * Everything the authed shell needs, in the one round-trip `_authed` already makes:
 * the verified user, plus the sidebar's collapsed/expanded state.
 *
 * The sidebar writes `sidebar_state` from the browser, but `SidebarProvider` only reads it
 * at construction — so without a server-side read the cookie is write-only and a collapsed
 * rail springs back open on every full page load.
 */
export const getShellFn = createServerFn({ method: 'GET' }).handler(async () => ({
  user: await currentUser(),
  sidebarOpen: getCookie('sidebar_state') !== 'false',
}))
