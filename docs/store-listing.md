# Store listing

The text both stores show, kept here so the two listings say the same thing
and change together. Facts come from the README and `web/src/routes/privacy.tsx`;
when those change, this file changes with them.

## Name and short lines

| Field | Store | Limit | Text |
| --- | --- | --- | --- |
| Name | both | 30 | Qamar360 |
| Subtitle | App Store | 30 | Sunnah habits by the moon |
| Short description | Play | 80 | Sunnah acts tied to the prayers you keep, each Hijri month an orbit of the moon |
| Promotional text | App Store | 170 | Tie a few acts of the Sunnah to the prayers you keep. Each one fills the month’s orbit round the moon. Miss one and it fills a little less. It never goes back to zero. |
| Keywords | App Store | 100 | sunnah,habit,tracker,hijri,muslim,islam,salah,prayer,adhkar,dhikr,quran,ramadan,lunar,routine,deen |

Alternatives, both from the homepage (164 and 145 characters):
- The sun set, and that was the cue. Tie a few acts of the Sunnah to the prayers you keep, and watch each Hijri month fill an orbit round the moon. Free, with no ads.
- Begin with the next crescent. Tie a few acts of the Sunnah to the prayers you keep, and each act you keep fills the month’s orbit round the moon.

Promotional text can change any time without a review, so a seasonal line
(Ramaḍān, the White Days) can replace it later.

## Screenshots

Real screens of the showcase account (3 Jumādā al-Thānī 1448, 07:45), one homepage line
above each, rendered by `scripts/store-screens.py` (iOS 1320×2868, Play 1080×1920). The files
live outside the repo in `../qamar360-store-assets/`, with the raw captures and the spec.

1. Today, Fajr open at 3 of 5: "Each prayer has its own stack." / Tick each act off as you do it.
2. Progress, Rabīʿ al-Awwal tapped at 360°: "Each act you keep fills the orbit." / A month kept in full is 360°. Twelve orbits make a year.
3. Add a stack: "Start from the Sunnah’s own moments." / Ready-made stacks, yours to reorder and prune.
4. Add a habit, two rakʿah before Fajr open on Muslim 725: "Every act names its source." / Collection and number, with the grading.
5. Add an exchange: "A good act in place of an old habit." / At the moment you’d usually reach for it.

Play also takes `play/feature-graphic-1024x500.png` (the moon in its orbit) and `play/icon-512.png`.

## Description (both stores)

```text
Qamar360 is a habit app for the Sunnah. You tie a few small acts to a prayer you already keep, tick them off after it, and each Hijri month fills an orbit around the moon.

STACKS
A few acts done straight after something you already do every day, such as Fajr, waking up or getting into bed. Ready-made stacks start from the Sunnah's own moments, and once added they are yours to reorder and prune.

EXCHANGES
A good act at the moment you would usually reach for an old habit, such as putting the phone away when you get into bed.

THE ORBIT
Each Hijri month is one orbit around the moon, and a month kept in full is 360°. A day you skip is excused rather than counted against you, and to-dos don't count. Twelve orbits make the year.

LUNAR UPDATES
Four notifications a month, one at each quarter of the moon, and none for any single habit. The prayer is the cue.

THE HIJRI DATE
It turns at your local Maghrib, on the Umm al-Qura calendar, with up to two days' adjustment for the sighting your masjid follows. The week runs Saturday to Friday. The stars behind the app are the sky over your time zone, so it never asks for your location.

DISCOVER
The catalog of acts, each citing its source by collection and number (Muslim 725, Tirmidhi 761), with the grading for a hadith outside Bukhari and Muslim.

There are no ads, no analytics and no tracking in the app.
```

## URLs and the rest

- Support: https://qamar360.com/support
- Marketing / website: https://qamar360.com
- Privacy policy: https://qamar360.com/privacy
- Copyright: 2026 Qamar360
- Category: Lifestyle (App Store primary), Health & Fitness secondary; Play: Lifestyle
- Price: free, no in-app purchases. Available in every region except China mainland,
  which requires a permit for apps with religious content.
- Content rights: yes, third-party content (hadith and Qurʾān text, NASA's moon imagery, the
  Inter font), with the rights to use it.
- Release: manually, after approval

## App Review

- Sign-in: the shared reviewer account used by the other apps (its email is in
  App Store Connect; the password is typed there by hand, never stored here).
- Notes:

```text
Sign in with the email and password above (Sign in with Apple and Google also work). Today lists the stacks; tap a stack to open it and tick its acts. Progress shows the Hijri month as an orbit around the moon. Settings > Delete account deletes the account and all its data in the app.
```

## Privacy answers (Apple App Privacy, Play Data safety)

No tracking, no ads, no analytics SDKs. Data is encrypted in transit, and the
user can delete it in the app (Settings > Delete account).

| Data | Apple type | Play type | Purpose | Linked | Optional |
| --- | --- | --- | --- | --- | --- |
| Email address | Contact Info › Email Address | Personal info › Email address | App functionality | yes | no |
| Apple / Google account id | Identifiers › User ID | Personal info › User IDs | App functionality | yes | yes (only with social sign-in) |
| Habits, stacks, completions, to-dos | User Content › Other User Content | App activity › Other user-generated content | App functionality | yes | no |
| Profile photo | User Content › Photos or Videos | Photos and videos › Photos | App functionality | yes | yes |
| The acts kept (prayers, fasts) reveal religious practice | Sensitive Info | Personal info › Religious or political beliefs | App functionality | yes | no |

Not collected: location, contacts, health, financial info, browsing, search,
diagnostics, usage data, device ids for tracking.

## Ratings

- Apple age rating: every content question "None"/"No" → 4+. Not made for
  kids (no Kids category).
- Play content rating (IARC): reference app, no violence, sex, language,
  drugs, gambling, user-to-user interaction or location sharing → Everyone.
- Play target audience: 13+ (the privacy policy says not for under-13s).
