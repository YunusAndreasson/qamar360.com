import { createFileRoute } from '@tanstack/react-router'

import { DocPage, docHead, Menu } from '#/components/doc-page'
import { Site } from '#/site'

/*
 * Written from what the app does, not from a template. Each claim has a source in the repo; when
 * the app changes, the line here changes with it:
 *   account: `public.users` holds only `email` and `avatar_path`; sign-in is Supabase Auth with
 *     email + password, Apple and Google (src/hooks/use-auth.tsx).
 *   records: `habits`, `habit_stacks`, `habit_completions`, `tasks`.
 *   photo: the private `avatars` bucket, picked from the library (src/lib/avatar.ts).
 *   on the device: the session and the habits/tasks cache (src/lib/supabase.ts,
 *     src/lib/habits-cache.ts), preferences (src/lib/preferences.ts), the four lunar notifications scheduled
 *     locally with no push token (src/lib/notifications.ts), the sky from the time zone
 *     (src/lib/geo.ts).
 *   deletion: the `delete-account` edge function empties the photo folder, then deletes the Auth
 *     user, which cascades to every row.
 *   usage events: Mixpanel, EU residency (src/constants/analytics.ts, src/lib/analytics.ts), no
 *     identify, no people profile, automatic events off, `reset` on sign-out and account deletion;
 *     the events and their properties are `ANALYTICS_EVENTS` and the `analytics.track` calls in
 *     src/app/_layout.tsx, src/hooks/use-auth.tsx and src/hooks/use-habits.tsx. No opt-out switch.
 *   crash reports: Sentry, ingest.us.sentry.io (src/lib/sentry.ts): no screenshots, view
 *     hierarchy, network or console breadcrumbs; `beforeSend` drops user, request and extra.
 *   no ads or tracking SDKs in package.json. Database in Supabase eu-central-1.
 *   website: the Cloudflare Web Analytics beacon in web/src/routes/__root.tsx, nothing else.
 */
export const Route = createFileRoute('/privacy')({
  head: () =>
    docHead('Privacy', 'What Qamar360 stores, where it is kept, who else handles it, and how to delete it.'),
  component: Privacy,
})

function Privacy() {
  return (
    <DocPage
      title="Privacy"
      lede="Qamar360 keeps only what it needs to show you your own days: an email address, the acts you choose to keep, and the days you kept them. The app also sends usage data and crash reports, which are not linked to your account. There are no ads and nothing is sold."
    >
      <h2>Who is responsible</h2>
      <p>
        Qamar360 is made by {Site.provider}, a private individual in {Site.country}. I am the data
        controller for the personal data described here. For anything on this page, write to{' '}
        <a href={`mailto:${Site.email}`}>{Site.email}</a>.
      </p>

      <h2>What the app stores about you</h2>
      <ul>
        <li>
          <strong>Your account.</strong> Your email address. If you sign in with Apple or Google, I
          receive the email address they share (with Apple this can be a private relay address) and
          an identifier for your account with them. If you use a password, it is stored only as a
          hash that nobody can read back.
        </li>
        <li>
          <strong>What you record.</strong> The habits, stacks, exchanges and to-dos you create, and
          the days you mark them done, partly done or skipped. They are stored on a server so they follow you to a new
          phone.
        </li>
        <li>
          <strong>A profile photo</strong>, only if you add one. It is stored privately and only your
          account can open it.
        </li>
        <li>
          <strong>Security logs.</strong> The sign-in service keeps routine technical records, such as
          the IP address and time of a sign-in, to protect accounts from misuse.
        </li>
      </ul>

      <h2>Usage data</h2>
      <p>
        The app sends usage events to Mixpanel: which screens are opened, signing in and out, and a
        few actions such as adding or completing a habit, with counts but not the names of habits or
        to-dos. Events are linked to a random identifier created on your phone, not to your account,
        email address or name. The Mixpanel library adds the phone model, operating system and app
        version. Mixpanel derives an approximate city, region and country from the IP address of
        each request. The app does not send your location. The data is stored in the EU and is used
        to understand how the app is used and to improve it. Signing out or deleting your account
        resets the identifier. There is no setting in the app to turn this off.
      </p>

      <h2>Crash reports</h2>
      <p>
        When the app crashes or hits an error, it sends a report to Sentry. The report contains the
        error and where in the code it occurred, the screens opened just before, the phone model,
        operating system and app version. A sample of sessions also sends loading times. Reports do
        not include your email address, account, screenshots or the content of your habits and
        to-dos. They are stored in the United States and used to find and fix faults.
      </p>

      <h2>What stays on your phone</h2>
      <p>
        Your settings, the four notifications a month, the night sky the app draws, your sign-in, and
        a copy of your habits and to-dos so the app opens quickly. The sky is
        worked out from your phone&rsquo;s time zone, on the phone. The app never asks for your
        location and never sends it anywhere.
      </p>

      <h2>What the app does not do</h2>
      <p>
        No advertising, no tracking across apps or websites, and no selling or sharing of your data
        for marketing. The app does not read your contacts, location, microphone or
        camera. It opens your photo library only when you choose a profile photo, and takes only the
        photo you pick.
      </p>

      <h2>Why I may use it</h2>
      <p>
        Your account and what you record are used to provide the app you signed up for (GDPR Article
        6(1)(b)). Security logs are kept because protecting accounts is a legitimate interest
        (Article 6(1)(f)). Usage data and crash reports are used to understand and improve the app,
        also a legitimate interest (Article 6(1)(f)). Nothing is used for any other purpose.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li>
          <strong>Supabase</strong> runs the database, sign-in and photo storage, on servers in
          Frankfurt, Germany.
        </li>
        <li>
          <strong>Mixpanel</strong> processes usage data, on servers in the EU.
        </li>
        <li>
          <strong>Sentry</strong> processes crash reports, on servers in the United States.
        </li>
        <li>
          <strong>Expo</strong> delivers app updates. When the app checks for an update, Expo&rsquo;s
          servers see the technical details of that request, such as your IP address, the app version
          and your phone&rsquo;s platform. Expo is based in the United States.
        </li>
        <li>
          <strong>Apple and Google</strong>, if you sign in with them, under their own privacy
          policies. They also handle your download from their app stores.
        </li>
        <li>
          <strong>Cloudflare</strong> hosts this website (see below).
        </li>
      </ul>
      <p>
        Each of them processes data on my behalf under a data processing agreement. Where data leaves
        the EU, it is covered by the safeguards the GDPR requires, such as the EU&ndash;US Data
        Privacy Framework or the European Commission&rsquo;s standard contractual clauses.
      </p>

      <h2>How long it is kept</h2>
      <p>
        For as long as you have an account. In the app, <Menu>Settings &rsaquo; Delete account</Menu>{' '}
        deletes your account, everything you recorded and your profile photo at once. It cannot be
        undone. Copies in the hosting provider&rsquo;s routine backups disappear as those backups are
        replaced. Security logs are kept for a short period and then deleted.
      </p>
      <p>
        <Menu>Settings &rsaquo; Reset progress</Menu> clears the days you have kept but leaves
        your account and your habits.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, for it to be corrected or deleted, for it in a format you
        can take elsewhere, or for its use to be restricted, and you can object to how it is used.
        Write to <a href={`mailto:${Site.email}`}>{Site.email}</a> from the address on your account
        and I will answer within a month. If you think I have handled your data wrongly, you can
        complain to the Swedish Authority for Privacy Protection (
        <a href="https://www.imy.se/en/">IMY</a>) or to the authority where you live.
      </p>

      <h2>This website</h2>
      <p>
        qamar360.com sets no cookies and has no sign-in. It is hosted by Cloudflare, which handles
        each request, including your IP address, to deliver the page and protect it from attacks.
        Visits are counted with Cloudflare Web Analytics, which uses no cookies and does not follow you
        to other sites.
      </p>

      <h2>Children</h2>
      <p>
        Qamar360 is not made for children under 13, and I do not knowingly keep data about them. If
        you believe a child has made an account, write to me and I will delete it.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes, the new version is published here with a new date at the top.
      </p>
    </DocPage>
  )
}
