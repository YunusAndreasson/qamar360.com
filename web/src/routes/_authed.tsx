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
  { to: '/plans', label: 'Plans' },
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

          {/* Scrolls rather than squeezing on a narrow window. Six uppercase mono tabs at 0.16em
              tracking do not fit beside the wordmark and Sign out on a phone, and the alternatives
              are worse: wrapping would break the 14-unit bar, and shortening the labels would cost
              every reader clarity to spare one layout. `min-w-0` is what lets the flex child give
              way; `shrink-0` on the tabs is what keeps them from being compressed to initials. The
              scrollbar itself is hidden: this bar is 56px tall, and a thin horizontal track inside
              it would cost more height than it buys clarity.

              `py-1` is load-bearing, not spacing. CSS forces `overflow-y` to `auto` as soon as
              `overflow-x` is not `visible`, and `.console-tab::after` — the active underline — sits
              at `bottom: -1px`. That 1px of vertical overflow was enough to raise a *vertical*
              scrollbar inside the nav and eat 10px of its width. The padding contains the
              underline so there is nothing to scroll. */}
          <nav className="no-scrollbar ml-auto flex min-w-0 items-center gap-5 overflow-x-auto py-1 sm:gap-7">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="console-tab shrink-0"
                activeProps={{ className: 'console-tab is-active shrink-0' }}
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
