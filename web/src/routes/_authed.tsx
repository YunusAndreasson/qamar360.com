import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouter } from '@tanstack/react-router'

import { MakerSignature } from '#/components/maker-signature'
import { QamarWordmark } from '#/components/qamar-logo'
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

const NAV = [
  { to: '/habits', label: 'Habits' },
  { to: '/routines', label: 'Routines' },
  { to: '/journal', label: 'Journal' },
  { to: '/progress', label: 'Progress' },
  { to: '/discover', label: 'Discover' },
] as const

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
    <div className="min-h-svh">
      <header className="command-bar sticky top-0 z-40">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/habits" className="shrink-0">
            <QamarWordmark />
          </Link>

          <nav className="ml-auto flex items-center gap-5 sm:gap-7">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="console-tab"
                activeProps={{ className: 'console-tab is-active' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <span
            className="ml-6 hidden max-w-[18ch] truncate border-l border-border pl-6 text-sm text-muted-foreground lg:inline"
            title={user.email ?? undefined}
          >
            {user.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="ml-2 shrink-0">
            Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <div className="flex flex-col items-center gap-4 border-t border-border pt-6">
          <QamarWordmark size={16} className="opacity-40" />
          <MakerSignature />
        </div>
      </footer>
    </div>
  )
}
