import { createFileRoute } from '@tanstack/react-router'

import { DocPage, docHead } from '#/components/doc-page'
import { Site } from '#/site'

export const Route = createFileRoute('/terms')({
  head: () => docHead('Terms', 'The terms for using the Qamar360 app.'),
  component: Terms,
})

function Terms() {
  return (
    <DocPage
      title="Terms"
      lede={`These terms are the agreement between you and ${Site.provider}, who makes Qamar360, for using the app. By creating an account you accept them.`}
    >
      <h2>The app</h2>
      <p>
        Qamar360 helps you keep acts of the Sunnah by tying them to moments you already keep, and
        shows your progress around the moon. It is free to use.
      </p>

      <h2>Your account</h2>
      <p>
        Use an email address you can receive mail at, and keep your password to yourself. You are
        responsible for what happens under your account. You can delete it at any time from{' '}
        <strong>Settings &rsaquo; Delete account</strong>.
      </p>

      <h2>What you record is yours</h2>
      <p>
        The habits, stacks and days you record belong to you. I store them only to run the app for you,
        as described in the <a href="/privacy">privacy policy</a>.
      </p>

      <h2>Using it fairly</h2>
      <p>
        Do not try to break into the app or its servers, reach other people&rsquo;s data, overload the
        service, or use it for anything unlawful. I may suspend an account that does.
      </p>

      <h2>Religious content</h2>
      <p>
        The hadith and verses in the app are given with their sources. They are there to encourage practice. They are not religious rulings;
        for questions of fiqh, ask a scholar you trust. If you find a mistake in a source or a grading,
        please <a href={`mailto:${Site.email}`}>tell me</a>.
      </p>
      <p>
        Some exchanges mention research on sleep, food or attention. That is general information, not
        medical advice.
      </p>

      <h2>No guarantees</h2>
      <p>
        I work to keep Qamar360 running and your data safe, but the app is provided as it is, and I
        cannot promise it will always be available or free of errors. To the extent Swedish law allows,
        I am not liable for indirect loss arising from its use. Nothing in these terms limits the rights
        you have as a consumer under the law where you live.
      </p>
      <p>
        If I ever stop running Qamar360, I will give notice in the app where I reasonably can, so you
        have time to ask for a copy of your data.
      </p>

      <h2>App stores</h2>
      <p>
        If you downloaded Qamar360 from the App Store, Apple&rsquo;s{' '}
        <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">
          Licensed Application End User License Agreement
        </a>{' '}
        also applies. Apple and Google are not responsible for the app or its support; I am.
      </p>

      <h2>Law</h2>
      <p>
        These terms are governed by Swedish law. Disputes go to the courts of Sweden, unless the law
        where you live gives you the right to bring them there.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If these terms change, the new version is published here with a new date at the top. Questions
        go to <a href={`mailto:${Site.email}`}>{Site.email}</a>.
      </p>
    </DocPage>
  )
}
