import { createFileRoute } from '@tanstack/react-router'

import { DocPage, docHead, Menu } from '#/components/doc-page'
import { Site } from '#/site'

/*
 * The labels quoted below are the app's own (src/app/(tabs)/settings/index.tsx and
 * src/app/(auth)/sign-in.tsx). Rename one there and the matching line here goes stale.
 */
export const Route = createFileRoute('/support')({
  head: () =>
    docHead('Support', 'How to reach the maker of Qamar360, and answers to the questions people ask most.'),
  component: Support,
})

function Support() {
  return (
    <DocPage
      title="Support"
      lede={
        <>
          Write to <a href={`mailto:${Site.email}`}>{Site.email}</a>. I make Qamar360 myself and read
          every message. Tell me which phone you use and what you expected to happen.
        </>
      }
    >
      <h2>I forgot my password</h2>
      <p>
        On the sign-in screen, tap <strong>Continue with email</strong>, then{' '}
        <strong>Forgot password?</strong> You will get a code by email to set a new one. If you signed up with Apple or Google, sign in with them
        instead; there is no separate password.
      </p>

      <h2>How do I delete my account?</h2>
      <p>
        In the app, <Menu>Settings &rsaquo; Delete account</Menu>. Your account, everything you
        recorded and your profile photo are deleted at once, and this cannot be undone. If you no
        longer have the app, write to me from the address on your account and I will delete it for
        you.
      </p>

      <h2>What is a stack?</h2>
      <p>
        A few acts tied to a moment already in your day, such as Fajr, waking up or getting into bed.
        The moment is the cue, and the acts follow it.{' '}
        <Menu>Settings &rsaquo; Habit stacking</Menu> explains it in full, with its sources.
      </p>

      <h2>What do the degrees mean?</h2>
      <p>
        Each Hijri month is one orbit around the moon. Every act you keep moves the ring, and a month
        in which you kept everything is a full 360°. A day you skip is excused and does not count
        against you. To-dos are not counted.
      </p>

      <h2>Why are there so few notifications?</h2>
      <p>
        Qamar360 sends four a month, one at each quarter of the moon, and nothing for each habit.
        Allow them, or turn them off, in <Menu>Settings &rsaquo; Lunar updates</Menu>.
      </p>

      <h2>The Hijri date is a day off</h2>
      <p>
        Moon sighting differs from place to place. Adjust it in{' '}
        <Menu>Settings &rsaquo; Hijri date</Menu> to match the calendar your masjid or community
        follows.
      </p>

      <h2>I want to start my progress again</h2>
      <p>
        <Menu>Settings &rsaquo; Reset progress</Menu> clears the days you have kept. Your habits
        and stacks stay as they are.
      </p>
    </DocPage>
  )
}
