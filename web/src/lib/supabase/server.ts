import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import { getRequestHeader, setCookie } from '@tanstack/react-start/server'

import type { Database } from '#/lib/database.types'

/**
 * A per-request Supabase client for the server (route `beforeLoad` guards, server functions).
 * Reads the session from the request cookies and writes refreshed tokens back onto the response,
 * so `supabase.auth.getUser()` here verifies the same session the browser client holds.
 * Must be created fresh for each request — never shared across requests.
 */
export function getSupabaseServerClient() {
  return createServerClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(getRequestHeader('cookie') ?? '').map((c) => ({
            name: c.name,
            value: c.value ?? '',
          }))
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            setCookie(name, value, options)
          }
        },
      },
    },
  )
}
