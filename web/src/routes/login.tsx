import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'

import { Field, FormError, FormNotice } from '#/components/console'
import { MakerSignature } from '#/components/maker-signature'
import { QamarBrandName, QamarMark } from '#/components/qamar-logo'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { supabaseBrowser } from '#/lib/supabase/client'
import { getUserFn } from '#/server/auth'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    // Already signed in? Skip the form.
    const user = await getUserFn()
    if (user) throw redirect({ to: '/habits' })
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password })
        if (error) return setError(error.message)
        await navigate({ to: '/habits' })
      } else {
        const { data, error } = await supabaseBrowser.auth.signUp({ email, password })
        if (error) return setError(error.message)
        // Email confirmation is on: signUp returns no session until the address is confirmed.
        if (data.session) await navigate({ to: '/habits' })
        else setNotice('Account created. Check your email to confirm it, then sign in.')
      }
    } finally {
      setBusy(false)
    }
  }

  const isSignIn = mode === 'sign-in'

  return (
    <div className="relative flex min-h-svh items-center justify-center overflow-hidden p-6">
      {/* one faint ring echoing the mark, for quiet depth behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[112vmin] w-[112vmin] -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{ borderColor: 'rgba(150,173,205,0.05)' }}
      />

      <div className="rise-in panel w-full max-w-[25rem] p-8 sm:p-9">
        <div className="flex flex-col items-center text-center">
          <QamarMark size={56} className="text-signal" />
          <h1 className="display-title mt-5 text-2xl leading-none text-foreground">
            <QamarBrandName />
          </h1>
          <p className="mt-3 max-w-[26ch] text-sm text-muted-foreground">
            {isSignIn
              ? 'Sign in to manage your habits and routines.'
              : 'Create an account to get started.'}
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-8 grid gap-5">
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete={isSignIn ? 'current-password' : 'new-password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <FormError message={error} />
          <FormNotice message={notice} />

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? (isSignIn ? 'Signing in…' : 'Creating account…') : isSignIn ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignIn ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            className="font-medium text-signal underline-offset-4 hover:underline"
            onClick={() => {
              setMode(isSignIn ? 'sign-up' : 'sign-in')
              setError(null)
              setNotice(null)
            }}
          >
            {isSignIn ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>

      <MakerSignature className="absolute inset-x-0 bottom-6 px-6" />
    </div>
  )
}
