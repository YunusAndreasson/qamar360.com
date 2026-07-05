import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '#/lib/database.types'

/**
 * The browser Supabase client. Session tokens live in cookies (shared with the server client in
 * `./server`), so the SSR route guards and the client see the same auth state. Vite statically
 * inlines the `VITE_*` env vars at build time. All per-user data reads/writes go through this
 * client — the existing row-level `user_id` RLS on habits/stacks/completions does the enforcing.
 */
export const supabaseBrowser = createBrowserClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)
