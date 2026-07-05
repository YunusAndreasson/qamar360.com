import { createServerFn } from '@tanstack/react-start'

import { getSupabaseServerClient } from '#/lib/supabase/server'

/**
 * The verified current user, resolved from the request's session cookie. Always runs on the
 * server (even when a route's `beforeLoad` fires during a client-side navigation), so route guards
 * can trust it. Returns null when there is no valid session.
 */
export const getUserFn = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data } = await supabase.auth.getUser()
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
})
