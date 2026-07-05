import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouter } from '@tanstack/react-router'

import { Button } from '#/components/ui/button'
import { supabaseBrowser } from '#/lib/supabase/client'
import { getUserFn } from '#/server/auth'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const user = await getUserFn()
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
  component: AuthedLayout,
})

const navBase = 'rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
const navActive = { className: 'rounded-md px-3 py-1.5 bg-muted font-medium text-foreground' }

function AuthedLayout() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const router = useRouter()

  async function signOut() {
    await supabaseBrowser.auth.signOut()
    await router.invalidate()
    await navigate({ to: '/login' })
  }

  return (
    <div className="min-h-svh bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
          <span className="font-semibold">Qamar360</span>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/habits" className={navBase} activeProps={navActive}>
              Habits
            </Link>
            <Link to="/routines" className={navBase} activeProps={navActive}>
              Routines
            </Link>
            <Link to="/discover" className={navBase} activeProps={navActive}>
              Discover
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
