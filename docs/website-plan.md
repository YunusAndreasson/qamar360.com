# qamar360.com: the download site

Plan, 2026-10-26. Decisions taken are in section 11.

**Status, 2026-10-26 (built, not deployed):** the web app is retired (old paths
301 to `/`); `/privacy`, `/terms` and `/support` are written; and `/` is the
download page.

**2026-10-27: `/` carries one message.** *The app sets no reminders: the
prayer is the cue, and the moon is the measure.* Habits are tied to the
prayers, which follow the sun; progress is tied to the moon. The only messages
the app sends are the lunar updates, at the moon's quarters. Every section says
one half of that message or leaves the page. As built (concision pass,
2026-10-27, ~20 phone screens, was ~24):

0. **Hero**: the crescent just after sunset, "Keep the Sunnah / by the sun /
   and the moon." (user pick 2026-10-27, replacing "Small acts, / kept by the
   sun / and the moon.", which gave the keeping to the sky), and the lede "Tie a
   few small acts to the prayers you already keep, and see each Hijri month
   fill an orbit around the moon. Qamar360 sets no reminders." (never "no
   notifications" or "no alerts": the lunar updates are notifications). The
   meta description is the title plus the lede. "Keep" twice on purpose: you
   already keep the prayers, so keep the Sunnah the same way.
1. **The turn** (one section; story pass 2026-10-27): it starts from the
   visitor's own year, not from other apps. "Every Ramaḍān the good acts come
   easily… By Shawwāl most of them have slipped away.", told again in the
   app's own measure by two rings (`AfterRamadan`): Ramaḍān's closes at
   360°, then Shawwāl's starts and stops at 70°, each labelled with its degrees
   over its name (2026-11-06: twice the size, so the passage has one picture and
   the year's "Shawwāl · 290°" answers a number already seen); and one line that
   reminders don't bring them back. Then **Bukhari 6464** as the verse (the most
   beloved deed is the most regular, even if little, which the lede's "a few
   small acts" echoes), and the turn: "The Sunnah sets its small acts at times that come
   anyway: the adhkār at the end of each prayer, three days of fasting at each
   full moon. Qamar360 is built on that." (user pick: answers "reminders don't
   bring them back" with a time that arrives whether you remember or not) (10:5 left the page for it,
   user call.)
2. **THE SUN**: **today's sun**, mirroring tonight's moon: one real sun (NASA
   SDO's visible-light photograph, recoloured in the site's warm, the moon's
   size) and a two-line caption, a small label and a plain fact: "TODAY IN STOCKHOLM" / "ʿAṣr comes next" (the moon mirrors it: "TONIGHT" / "16 Jumādā al‑Awwal 1448") (the
   visitor's time-zone city, never a clock time; no credit line under the sun
   or the moon, user call 2026-10-27); then Qurʾān 17:78 as a verse; "You already pray five times a day.
   Tie a few small acts to a prayer, and the prayer becomes the reminder.", with Stawarz 2015 (routine cues beat reminders) as
   its cite. Then **`DayPlay`** (`components/day-play.tsx`), its marker naming
   the prayer the sun rests on (FAJR, DHUHR, ʿAṢR, MAGHRIB, ʿISHĀʾ): the sun travels
   `SunPath`'s arc and rests on each prayer while that prayer's curated stack
   ticks on a DOM port of Today (`components/stack-card.tsx`), each act with
   its sunnah.com-checked source. Fajr (Bilāl, Bukhari 1149), then Dhuhr, ʿAṣr
   and Maghrib passing, then ʿIshāʾ closing the day. The
   day-complete card ("2 Shaʿbān 1448 · 12° · 29 days left") is the bridge to
   the moon: "The last act closes the day. The month moves one day further
   round the moon." While it is up the arc steps back to `--unlit`, so the card
   is the one lit thing. Then the **Maghrib** still (2026-11-06, user pick; it
   replaced a supper table, which read as dinner rather than the prayer): a man
   kneeling in the sitting of the prayer just after sunset, by the window of the
   flat in the app's guide photos, a phone lying face down on the table. Marked
   `MAGHRIB`: "No alarm went off. The sun set, and that was the cue."
3. **THE MOON**: tonight's moon live, Qurʾān 2:189 as a verse, then
   `MonthOrbit` plays **a Shaʿbān kept in full** (not Ramaḍān: no White Days in
   Ramaḍān). Its 1st says the app writes only when the moon turns a quarter;
   the four lunar updates appear as cards on the 1st, 8th, 15th and 22nd. 15 is
   the White Days (Tirmidhi 761, ḥasan), 22 nine nights left (Bukhari 1969),
   360° closes on "The orbit closes." over Bukhari 1909, with the next
   crescent rising in the warm ring. Marker: "A Shaʿbān, every act kept".
   **User call (2026-10-27): don't lean on Ramaḍān, or it reads as a Ramaḍān
   app.** Ramaḍān stays where it sets up the rest of the year (the opening's
   slip, the year's Shawwāl that holds) and in the sources; no countdowns to
   it, no headings about it.
   Then the rooftop still with no words, and twelve orbits make a year (Qurʾān
   9:36 as its cite). The year is the opening's payoff: its example Shawwāl
   holds at 290°, so Shawwāl draws after Ramaḍān closes and the caption names
   it once ("Shawwāl · 290°") before it says "An example year" again.
4. **Close**: the last crescent before dawn, "Begin with the next crescent.",
   and one live line from the visitor's calendar, "Jumādā al‑Thānī begins in
   15 days." (`nextMonth` in `web/src/lib/moon.ts`; "begins", never "is
   sighted"). Under the call, one quiet line (2026-11-06, user call): "Free,
   with no ads and no tracking.", as the terms and the privacy policy say; if
   either changes, this line changes with it.

Cut in the concision pass (assets kept): the streak and "tied to the phone"
paragraphs, the sill still (the Fajr stack already plays live), the Umm
al‑Qura passage, the lunar-updates passage and its live "next one" line,
Bukhari 6464, the Bukhari 554 hinge, Qurʾān 36:39, and the Adriaanse and Harkin
cites, and **exchanges** (user call: a visitor doesn't know the word, and
an act cued by a meal blurs "the prayer is the cue"; they stay in the app and
the App Store listing). Earlier passes had already cut the wuḍūʾ, Jumuʿah rug and bedside
stills.

Four texts are set as verses, one per beat: Bukhari 6464 (the turn), 17:78 (the sun),
2:189 (the moon) and Bukhari 1909 (the month's end, inside `MonthOrbit`). The
studies and the other hadith stay small citations. Qurʾān translations are
Khattab's (*The Clear Quran*); the page cites the āyah alone, without the
translator (user call, 2026-10-27). All sources were checked
against sunnah.com and quran.com on 2026-10-27. With the Umm al‑Qura line gone,
the page must still never claim the crescent is sighted: the app calculates it.

**Pace rules** (keep them when the page changes):

- One idea per screen. A typographic screen holds about 40 words at most; a
  frame keeps its two-sentence limit.
- No more than two word-carrying photo frames in a row; a line of type or a
  chapter card comes between.
- The two halves open with their title cards, `THE SUN` and `THE MOON`. No
  "First… / Then…" signposts. The prayer is the cue and the moon is the
  measure: a section that says neither leaves the page. Say "no reminders",
  never "no notifications".
- One large verse per beat; a second source on the same point is cut, not
  added.
- The turn (the sky) lands by the third screen on a phone.
- About 20 phone screens in all (390×844); the month is the longest stretch,
  the day the next. The first legible app UI (the Fajr card) lands by the fifth
  phone screen; don't let it slip later.
- Distance says what belongs together. Use four levels, and never the same
  distance for two different relations:
  - Inside a group (a label, its heading, its text, its source): 16–32 px.
  - Between the parts of one argument (a passage, its figure, its verse, its
    note): a step, 0.6 beat.
  - Between arguments, and between a run of type and a frame: one beat.
  - Before a chapter card: a beat and a half (two beats left a near-empty
    screen on desktop). The card then sits a step above what it opens.
- Distance follows the argument, not the markup. Two paragraphs that say
  different things (the problem, then the turn) are a step apart, never one
  paragraph gap; a line and the verse that grounds it are one claim and stand
  close (32–48 px, `.story-claim`).
- A figure follows the words that explain it. A source that is not about the
  figure comes after it, never between the two.

**Fit and scale** (principal pass, 2026-10-30; keep them when the page changes):

- **A played stage never cuts anything off.** Test at what a browser really
  leaves, not at the device's size: iPhone 14 in Safari is 390×664 with its bars
  up, iPhone SE 375×553, a 13-inch laptop 1280×640. The stage's words and cards
  keep their size and the picture (the moon, the arc) takes the height left over,
  up to its own full size (`.month-picture`, `.day-picture`, read as `100cqh`).
  Short screens tighten in two tiers (`max-height` 719 and 599): the app's rows
  to their densest; then, on a phone, a stop that has its own words keeps its
  source and lets the quotation go, and the marker steps aside. A stop that is
  only a quotation keeps it.
- **A large screen sees the laptop's composition, larger.** `--u` on `.landing`
  is a pixel up to 1440 and grows with the screen to 1.4 at 2016; sizes that
  should grow are written `calc(N * var(--u))`, and the app's own screens drawn on
  the page grow as one piece through `zoom` in three steps. Don't add a new fixed
  cap in px or rem to the landing page.
- **The headline is three lines on every phone**: its size follows the width, so
  its longest line nearly fills the measure and never wraps to a fourth.

The earlier, superseded builds: a page round the orbit alone (2026-10-26), and
before that one night from Maghrib to Fajr (section 4's table below).

## 1. What the site is for

One job: a visitor understands what Qamar360 does, feels something, and taps a
store badge. Everything on the page is measured against that.

- **One action**: download. No sign-up, no newsletter, no login (the web app is
  retired, section 8), no pricing table, no blog.
- **English only** at launch. **No Arabic script** on the page; transliteration
  only, as in the app. One exception (user call, 2026-10-27): **ﷺ after the
  Prophet's name**, drawn from a one-glyph Noto Sans Arabic subset
  (`web/src/fonts/honorific.woff2`) so it never falls back to a system font.
- **One metric**: store-badge taps per visit, split by platform (section 9).
- **Dark only.** No light theme, no toggle. The site is night.

## 2. The two judges

**Dieter Rams** reads the page and asks of every element: what does this do for
the visitor? He should find no carousel, no counters, no invented testimonials
or ratings, no cookie banner, no stock icons in circles, no "features grid".
The screenshots are the real app, not mock-ups. The page loads fast and works
without JavaScript. It is honest about what the app does and does not do.

**Christopher Nolan** watches it on a phone in a dark room and should remember
one image. What we take from his night scenes (Hoyte van Hoytema's lighting in
*Interstellar*, *The Dark Knight*, *Oppenheimer*) is method, not imitation:

| In his films | On the page |
|---|---|
| Darkness that keeps detail; blacks are deep, never crushed to flat `#000` | Background `#060910`, the app's own night. Photos graded so shadows hold texture |
| Light only from sources you can see: a window, a lamp, the moon | Every warm tone on the page comes from a light source, inside a photo or the one warm accent. No decorative glows |
| People small in a large frame | Wide crops, figures off-centre and seen from behind. Lots of negative space |
| Time as structure | The page runs through one night, Maghrib to Fajr (section 4) |
| Silence and restraint | Long pauses between sections. Few words. No sound |
| Large-format title cards: small, widely spaced capitals | Section markers set the same way: `MAGHRIB`, `ʿISHĀʾ`, `FAJR` |

Where they disagree, follow the rule in `AGENTS.md`: Rams decides what is on
the page, Norman (and here Nolan) decides how it is found and felt.

## 3. What to show: five aspects of the app

The app does a lot. The page shows five things, chosen because each one is
both true and unusual. Everything else is left for the App Store listing.

1. **Stacks.** Acts anchored to a moment you already keep: after Fajr, one
   page; after wuḍūʾ, two rakʿah. The idea the whole app stands on.
2. **Exchanges.** A good act placed where an old habit keeps happening:
   getting into bed, phone out of reach.
3. **The orbit.** Progress is measured in degrees around the moon. A full month
   is 360°. Twelve orbits make a year. (The app's core image; the user has
   called it "the whole point of the app".)
4. **The day on Hijri time.** The Hijri date turns at the real local Maghrib
   (tracking itself still closes at midnight), the week runs Saturday
   to Friday, and the stars behind the app are the real sky over your city,
   worked out from your time zone, with no location permission.
5. **Quiet by design.** Four notifications a month, one at each quarter of the
   moon. Nothing nags per habit.

A sixth thing runs underneath and gets one line, not a section: every hadith in
the app is cited with its grading, and a ḥasan is called ḥasan.

Not shown: to-dos, per-act statistics, Discover, account features, the web
dashboard. They are real but they are not why someone downloads.

## 4. Structure: one night, top to bottom

The Hijri day begins at sunset. The page does too, and it ends at dawn. As you
scroll, the sky behind the content moves very slowly from the last blue of
Maghrib through deep night to the first grey of Fajr. It is a background
gradient tied to scroll position, barely noticeable, and it gives the page an
order that needs no explanation.

| # | Marker | Section | Image | Content |
|---|---|---|---|---|
| 0 | `MAGHRIB` | Opening | Full-bleed: the man walking under the crescent (`auth-hero`, extended to wide) | Wordmark, headline, one sentence, store badges |
| 1 | `AFTER FAJR` | Stacks | `guide-stacking` (the man by the window, the book on the table) | Headline, two sentences, Today screenshot |
| 2 | `GETTING INTO BED` | Exchanges | `guide-exchange` or a new bedroom image | Headline, two sentences, exchange screenshot |
| 3 | `ʿISHĀʾ` | The orbit | None. The ring itself, drawn on the page, large | Headline, the ring filling to a real number, Progress screenshot |
| 4 | `NIGHT` | Real sky | New: figure on a balcony or rooftop under stars | Headline, one sentence, a band of real stars rendered on the page |
| 5 | `THE QUARTERS` | Notifications | None. Four moon phases in a row | Headline, one sentence |
| 6 | `FAJR` | Close | New: dawn over rooftops, one lit window | Headline, badges again, QR code on desktop |
| — | | Footer | | Privacy, Terms, Support, Instagram, X, maker credit |

Rhythm: photograph sections alternate with typographic ones (3 and 5 have no
photo), so the page breathes and the images keep their weight.

The markers follow the night in order. Section 1 says `AFTER FAJR` because
that is the example's moment, not the page's clock; if that reads as a
contradiction in review, the marker becomes `STACKS` and the time markers stay
on sections 0, 3, 4 and 6 only.

## 5. Copy

### Rules

These come from the app's own copy rules (memory: *No AI slop in copy*) and
apply to every string on the site.

- **No em dash as connector.** Comma, full stop or colon.
- **Objects do not want things.** A habit does not call, wait or ask.
- **No templates.** No "Your X will appear here", no "Unlock / Elevate /
  Seamless / Journey / Transform / Empower", no "Whether you're X or Y".
- **No rule-of-three cadence** ("Simple. Beautiful. Powerful.").
- **Concrete over abstract.** "After Fajr, one page" beats "build better habits".
- **Short.** A headline is one line on a phone. Body is at most two sentences.
- **Transliteration with full diacritics** (wuḍūʾ, rakʿah, ʿIshāʾ), matching the
  app. Collection names stay plain (Bukhari, Muslim).
- **Never overclaim.** No "science-backed", no "proven", no user counts.
- **Every claim names its source on the page.** A study by authors and year
  (Adriaanse et al., 2011), a hadith by collection and number (Bukhari 1149).
  Checked against the primaries on 2026-10-26: Bukhari 1149 does not say "two
  rakʿahs" (Muslim 234 does); no day counts ("21/66 days"); no claim that the
  lunar month itself motivates.
- **Say only what the app does.** The calendar is calculated Umm al-Qura
  (adjustable ±2 days), not sighted; tracking turns at midnight, not Maghrib;
  the sky is the time zone's, not the city's; Bukhari/Muslim carry no grading
  label, so never promise "each hadith with its grading".
- Read every line aloud. If it sounds like an advert, cut it.
- **No aphorisms.** No balanced "the X tells you when, and the Y how far"
  lines, no "Nothing X, and nothing Y" closers, no appositive that re-explains
  the sentence before it. Say the plain thing.
- **Show, don't explain.** A line that explains a mechanic the played day or
  month already shows (degrees per day, how a missed act counts, which days a
  fast appears) goes to /support, not the page. The page speaks to why.
- **No app-internal nouns** a visitor can't know (exchange, stripe, Today,
  Progress) unless the sentence explains them. "Stack" is explained where it
  first appears.

### First draft

To be read aloud and rewritten with you; these set the register.

**0 · Opening**
> The day begins at Maghrib.
>
> Qamar360 ties small acts of the Sunnah to the prayers you already pray, and
> shows each month as one orbit around the moon.

**1 · Stacks**
> After Fajr, one page.
>
> You don't have to remember the deed, only the moment you already keep. A few
> acts after one prayer is a stack, and you learn it by doing it.

**2 · Exchanges**
> Put the phone away before you lie down.
>
> Some habits have a place in the day already. An exchange puts a good act in
> that place.

**3 · The orbit**
> A month is 360°.
>
> Every act you keep moves the ring around the moon. Twelve orbits make a year.

**4 · Real sky**
> The stars are tonight's.
>
> The sky behind the app is the one over your city, worked out from your time
> zone. It never asks for your location.

**5 · Quarters**
> Four notifications a month.
>
> One at each quarter of the moon. That is all.

**6 · Close**
> Fajr is close.
>
> [App Store] [Google Play]

**Line under the close**, small: *Every hadith in the app carries its source
and its grading.*

## 6. Visual system

### Colour

Taken from the app's generated palette, so the site and the app are visibly the
same product:

| Role | Value | Use |
|---|---|---|
| Night | `#060910` | Page background, the base of the scroll sky |
| Text | the app's dark `text` role | Headlines and body |
| Text, quiet | the app's dark `textSecondary` (APCA Lc 61) | Body copy, cites |
| Text, faint | night 10, `#9298A4` (Lc 46) | Markers, captions, notes. Night 9 measured Lc 35, too low for small type |
| Ice | `#89C2E3` | Focus rings, links. Used rarely |
| Moonglow | `#F4EACB` | The orbit's arc and one warm star. The only warm colour that is not inside a photograph |

Two temperatures, as in the app: cold is the night, warm is light and things
done. No gradients except the scroll sky and the photographs' own light.

### Type

**Inter**, the app's face, and nothing else. Display cut (Inter's large optical
size) for headlines with tight tracking; text cut for body; the section markers
in small capitals with wide tracking, the one Nolan touch in the type.

Why not a cinematic serif: the app tried a display serif in July and the user
rejected it the same day as unreadable. A site that looks unlike the app it
sells also breaks the visitor's expectation once they open the app (Jakob's
Law). Contrast comes from size and spacing, not from a second family.

To check before build: Inter's coverage of ʿ ʾ ā ḥ ṣ ī ū (U+02BE, U+02BF and
the dotted letters). A fallback glyph inside a headline would break the mood.
If any are missing, subset them from a matching face or reword.

Scale, approximate: headline 44 / 28 px (desktop / phone), body 19 / 17 px,
marker 12 px at 0.2em tracking. Body line length ≤ 60 characters.

Small capitals are for title cards only: the chapter cards, the prayers' names
and the sky's labels. A source under a verse and the month's marker are sentences
and names, so they stand in their own spelling, where the diacritics can be read
(Qurʾān 17:78, not QURʾĀN 17:78).

### Imagery

Three photographs exist and already have the right mood: blue-hour European
streets and rooms, one figure, seen from behind, warm practical light against a
cold window. They are the reference for everything new.

The problem is size: `guide-*` are 1200×800 and `auth-hero` is 941×1672
portrait. A full-bleed desktop image needs ~2560 px wide. So:

- `auth-hero`: outpaint to a 2.39:1 wide master for desktop, keep the portrait
  crop for phones (the crescent and the figure both survive).
- `guide-stacking`, `guide-exchange`: regenerate at 2560 px from the same
  composition, or upscale and check grain.
- Three new images (section 4 table: night sky, dawn, optionally bedroom).

**Brief for Codex image generation** (one shared prefix so the set matches).
*Superseded 2026-11-06:* the shared prefix is now `web/art/prompts/style.txt`,
written as a photographer's notes on light and camera. Words like "cinematic"
and a cinematographer's name pulled the model's stock look and a raw render was
judged "pure AI"; the method that works is in `web/AGENTS.md` (references, plain
prompts, the grade, judged beside the set). The original brief, for the record:

> Cinematic still, 35 mm anamorphic, blue hour or night in an old northern
> European city (Copenhagen, Stockholm). One man, late twenties, beard, dark
> clothes, seen from behind or in silhouette, face never fully visible. Light
> only from visible sources: a window, a lamp, a street light, the moon. Deep
> blue exterior, warm amber interior. Shadows deep but holding detail. Fine film
> grain, muted colour, no lens flare, no text, no logos, no mosque silhouettes,
> no glowing crescents on domes.

Shots:

1. **Night**: the figure on a rooftop or open window ledge, small in the frame,
   the sky taking two thirds, stars visible and sparse (real-looking, not a
   wallpaper Milky Way). 2.39:1.
2. **Fajr**: rooftops before dawn, sky grey-blue at the horizon, one window lit
   warm. No figure, or a figure very small. 2.39:1 and 4:5.
3. **Bedroom** (only if `guide-exchange` doesn't fit section 2): a bed in a dark
   room, a phone face-down on a shelf across the room, cold window light.

Keep the man consistent in build and clothing; since the face is never shown,
the set holds together without identity matching.

All images: AVIF with WebP fallback, responsive `srcset`, hero ≤ 180 KB on
phone, a blurred low-res placeholder that matches the image's darkness so
nothing flashes light while loading.

### Screenshots

Real captures from the app in dark mode, taken on the QA account with
believable data (not a perfect month: a real one looks lived in). Taken with
argent on a device, never drawn. Three: Today with a stack open, an exchange,
Progress with the orbit around 250°.

Shown without a device frame: the screenshot with the phone's corner radius and
a hairline border, so it reads as a screen without a glossy render competing
with the photography.

### Motion

Little, slow, and all of it off under `prefers-reduced-motion` (one global
rule in `site.css`; the JS-driven parts check it too). Motion says that the
night is passing or that something has arrived, and nothing else.

It is one vocabulary, defined once at the top of `web/src/site.css`, so the same
kind of thing moves the same way wherever it is:

- **One curve and one rise.** `--ease` everywhere; nothing moves further than
  `--rise` (8 px).
- **A pace per kind of change:**
  - touch, 0.4 s;
  - state, 0.6 s;
  - swap, 0.8 s;
  - arrive, 1.2 s;
  - verse, 1.6 s;
  - light, 2.4 s.
- **Two waits.** `--follow`, 0.4 s, after a thing's subject. `--stagger`,
  0.12 s, between the parts of one group.
- **Two patterns.** *Arrive* (fade and rise) is one rule shared by text,
  stops, cards and notifications. *Develop* (light out of the night) is shared
  by the photographs, the sun, the moon and the hero. One observer
  (`useReveal`) starts both.

A new element joins a pattern by its class (`.reveal` or `.develop`) and
names at most its pace and wait. It never writes a duration of its own.

As built (2026-10-27):

- **One night, top to bottom.** The home page runs Maghrib to Fajr. A faint
  dusk glow sits low on the screen while the opening is read. Over the last
  screens a cool dawn glow rises and the stars fade by a third, as they do before
  Fajr. This is `nightLight` in `web/src/lib/play.ts`, set by the starfield as
  `--dusk`/`--dawn` on a fixed `.horizon`. It is never more than a tint, and the
  other pages stay in plain night.
- **The sun lights the played day** (`skyAt` in `web/src/components/sun-path.tsx`,
  tested). The sun on the arc is the same NASA picture that opens the half, and it
  lights the diagram's sky as it goes: a cold line of true dawn at Fajr, the blue
  of a sky lit from above at Dhuhr, warm air as it nears the horizon, and at
  ʿIshāʾ nothing, because the twilight has gone. The horizon stops the light and
  hides the sun as the ground does, so at Maghrib it stands half set. It is a
  tint, moved by transforms; only the sun's light may be warm here.
- **The stars** (`web/src/components/starfield.tsx`) set the scene and are not
  the subject:
  - about one star per 2,500 px², mostly faint;
  - three depths that move 2–8% of the scroll;
  - a drift of at most a pixel a second;
  - mid and faint stars twinkle over 5–11 s;
  - under reduced motion, one still frame that still takes the night's light.
- **The first screen.** The photograph comes up out of the dark over 2.4 s. The
  headline arrives over it a line at a time, 0.12 s apart; the lede, the app
  screen, the call and the wordmark follow its last line, all within a second.
  The headline is the largest paint, so it starts at 1% opacity, not 0: Chrome
  counts no paint at opacity 0, and at 0 the page reported no LCP at all
  (measured: LCP stays at first paint, ~0.5 s at 4× CPU). All CSS, so it runs
  before hydration. The footer arrives as the page's last reveal.
- **Reveals.** Text fades in once and rises 8 px. Verses don't rise: they come
  into focus over 1.6 s. A still's words, the year's heading and the close
  arrive line by line, 0.12 s apart.
- **Stills develop.** Each photograph comes up out of the night once it is on
  screen *and* decoded, so a fast scroll never flashes a picture in. Words laid
  over a still wait 0.6 s for it.
- **Chapter cards** open their horizon lines out from the word.
- **The sun and the moon** at the head of each half fade in once their picture
  is there.
- **The year** draws its twelve stripes once as it comes into view, Ramaḍān
  closing last; then Shawwāl draws, its number lights and the caption names
  it for about three seconds (`--shawwal-at`, `--beat-at` on `.year`). The
  opening's two rings draw the same way, one after the other. Both are the
  page's setup and payoff: the slip after Ramaḍān, and a Shawwāl that holds.
  A ring hides at once when the reveals are set up and only its drawing is
  timed, or a long wait would leave it drawn on screen until it ran out.
- **The played stages** fade in as their section arrives and back into the
  night as it leaves (`arrival` × `departure`).
- **Between pages**, one soft crossfade (the router's view transition).
- **Never:** parallax or zoom on photographs, text split into words or letters,
  loops other than the stars, scroll-jacking, auto-playing video or sound.

Photographs dissolve into the night through masks, never a shade to the night
colour.

## 7. Download mechanics

This is where Norman matters most: the action has to be obvious from anywhere
on the page and do what the visitor expects.

**Before launch.** The app is in neither store yet, and a badge that leads to
a missing listing is a broken promise. So the site has two states behind one
flag in code (per store, since the two may not go live the same day):

- **Pre-launch**: where the badges will go, one quiet line: *Coming to iPhone
  and Android.* No waitlist, no email field, no countdown. `/get` sends
  everyone to the home page. No Smart App Banner, no QR code.
- **Live**: the flag flips per store and everything below appears. One deploy,
  no other change.

When live:

- **Official badges** (Apple's "Download on the App Store", Google's "Get it on
  Google Play"), black versions, per their guidelines. In the opening and the
  close only; a third set would be clutter.
- **Platform first**: on iOS show the App Store badge alone with a small "Also
  on Android" link; the reverse on Android. Desktop shows both plus a **QR
  code** that goes to `/get`, so a visitor on a laptop can scan with their
  phone. The page is server-rendered with both badges, then trimmed on the
  client, so nothing breaks without JavaScript.
- **`/get`**: a redirect route that sends iOS to the App Store, Android to Play,
  desktop to the home page. One link for Instagram and X bios.
- **iOS Smart App Banner** meta tag (`apple-itunes-app`, app id `6797297008`).
- A sticky "Download" bar on phones appears only after the opening badges have
  scrolled out of view, and goes away at the close.

## 8. Build

**Where**: in `web/`, the Cloudflare Worker that already serves qamar360.com.
One domain, one deploy, every page prerendered to static HTML.

**The web app is retired.** The site supports no login, so the existing web
app goes, not just its link: the `_authed` routes (habits, routines, discover,
progress), `/login`, the Supabase client and server auth, `web/src/lib`'s
progress maths and its tests, the shadcn components, Geist, TanStack Query and
the devtools. What's left of `web/` is a static site on the same worker and
domain. `web/AGENTS.md` and the memory notes about the web dashboard are updated
to match. This is a separate first commit, so the site is built on a clean base
and the removal can be reviewed on its own.

Routes after the retirement:

| Route | What |
|---|---|
| `/` | The landing page. Today it redirects to `/login`; that changes |
| `/get` | Store redirect (section 7) |
| `/privacy`, `/terms`, `/support` | The app's Settings already links to these (`src/constants/links.ts`), they don't exist yet, and both stores need a live privacy policy URL (Apple also a support URL) before review. Written from scratch, section 8a |
| `/login`, `/habits`, … | Gone. Old URLs redirect to `/`, so bookmarks don't land on a 404 |

Budgets:

- LCP under 1.8 s on a mid phone over 4G; CLS 0.
- JavaScript on `/`: under 15 KB, only for the platform badge, the QR code and
  the orbit's draw. The page reads and the badges work without it.
- Two font files (Inter text + display), subset to Latin + the transliteration
  marks, preloaded.

Meta: Open Graph and Twitter images cut from the hero (dark, the crescent
visible at thumbnail size), a `MobileApplication` JSON-LD block with no invented
rating, sensible title and description.

## 8a. Privacy, terms, support

None of these exist, so they are written from scratch. They are written
from what the code actually does, not from a template, and in the same plain
voice as the site. Each is one readable page, set the same way as the landing
page but without photographs.

**Privacy** describes, from the code:

- **Account**: email and password, or Sign in with Apple / Google
  (`expo-apple-authentication`, `@react-native-google-signin`), stored in
  Supabase.
- **What you record**: habits, stacks, exchanges, to-dos and the days you kept
  them, stored in Supabase so they follow you between devices.
- **Profile photo**, if you add one: a private storage bucket.
- **Notifications**: scheduled on the device, four a month.
- **Location**: never collected. The night sky is computed on the device
  from the phone's time zone.
- **No analytics, no ads, no tracking SDKs in the app** (verified against
  `package.json`: none installed). The website uses cookieless Cloudflare Web
  Analytics only.
- **App updates** are fetched from Expo's update service (`expo-updates`).
- **Deleting your account** from Settings, and what that removes. Check first:
  the `delete-account` edge function's avatar cleanup was written but noted as
  not deployed. Deploy it before the policy says photos are removed.
- Who runs the app, how to contact them, and the date the policy last changed.

The App Store privacy labels and the Play data-safety form are filled in from
the same list, so the three never disagree.

**Terms**: short. The app is provided as is; you're responsible for your
account; religious content is given with its sources and gradings, for
guidance, not as a fatwā; how the terms change.

**Support**: a contact address, how to delete your account, how to restore
access, and the two or three questions people will actually ask (how stacks
work, why there are only four notifications, what the degrees mean). No help
centre.

These ship first (section 10), because store review needs them.

## 9. Measurement and privacy

- **Cloudflare Web Analytics**: cookieless, so no consent banner.
- Badge taps counted as events; App Store links carry a campaign token (`ct`)
  per section and per source (`site-hero`, `site-close`, `bio`), Play links a
  `utm` referrer. App Store Connect and Play Console then show which part of the
  page actually sends installs.
- No third-party scripts, no pixels.

## 10. Order of work

1. **Retire the web app** (section 8), one commit, `pnpm verify` green.
2. **Legal pages first.** Write privacy, terms and support (section 8a), deploy
   them on a plain holding home page, and put the URLs in App Store Connect and
   Play Console. This is the only part store review is waiting on.
3. **Copy.** Final words for every section, read aloud together, before any
   layout. If a section's copy won't come right, the section goes.
4. **Images.** Codex generation from the brief; pick, grade to match the
   existing three, export. In parallel, capture the three screenshots on device.
5. **Grey-box build.** Real copy and real images, no motion, on a phone first.
   Check the rhythm and the one remembered image here, before polish.
6. **Polish.** Scroll sky, orbit draw, stars, the pre-launch/live flag,
   platform badges, `/get`, QR, meta.
7. **QA.** Real iPhone and Android in a dark room at night; desktop Safari,
   Chrome and Firefox; reduced motion on; JavaScript off; Lighthouse; APCA
   contrast on every text colour over every image it sits on; screen reader
   pass of the headings and image descriptions. Check both flag states.

   **Measured so far** (2026-10-27, local production build, Chromium at a
   390 px phone width with 4× CPU throttling):
   - **First paint:** the headline is the largest paint, at 0.4–0.5 s, the
     same with motion on, with reduced motion and with WebGL off.
   - **Lighthouse mobile** (simulated): performance 53, accessibility 100,
     best practices 82 (one deprecation, since fixed), layout shift 0.
     - Its LCP of 4.9 s is the simulation charging the whole page script to
       the paint, inflated by software WebGL here.
     - With real throttling (`--throttling-method=devtools`): LCP 3.4 s, total
       blocking time 950 ms.
     - The local preview serves the files uncompressed (300 KiB of the
       savings); Cloudflare compresses them.
   - **Scroll:** motion on and off drop the same number of frames. The slow
     frames are in the played day and month (the WebGL moon and the
     per-scroll re-render), not in the fades.

   **Safari on a real iPhone** (no WebKit on the dev machine), in a dark room:
   - The street comes up from the dark at first paint without a flash. The
     headline arrives a line at a time, and the lede, the screen and the call
     follow.
   - A fast flick past a still never shows it bright before it develops.
   - The dusk glow at the top and the dawn glow at the foot stay a tint.
     Neither jumps when the address bar hides or shows (`.horizon` is
     `100lvh`).
   - Each verse comes into focus cleanly, with no blurred edge left behind.
   - The played day and month scroll without stutter, and their stages fade in
     and out.
   - Privacy → home → Terms crossfades (Safari 18 has view transitions).
   - Settings → Accessibility → Motion → Reduce Motion: nothing fades or
     moves, and everything is visible.
8. **Deploy in pre-launch state.** `cd web && pnpm verify && pnpm deploy`. The
   site can be public before the app is: it says what is coming and links
   nowhere it can't keep.
9. **Launch day, per store.** Flip that store's flag and deploy; set the
   Marketing URL in the listing; once both are live, change the Instagram and
   X bios to `/get`.

The two judges sign off at step 5 and again at step 7:

- **Rams check**: point at every element and say what it does for the
  visitor. Anything without an answer is removed.
- **Nolan check**: scroll it once at night on a phone, put the phone down, and
  name the image you remember. If there isn't one, the photography isn't done.

## 11. Decisions

Taken 2026-10-26:

1. **The app is not in either store yet.** The site is built and deployed
   now in a pre-launch state, with no badges and no waitlist; each store's
   badge switches on the day that store goes live (section 7).
2. **No login on the web.** The existing web app is retired, not hidden
   (section 8).
3. **Privacy, terms and support don't exist.** They're written from the code
   and ship first, because store review needs them (section 8a).
4. **No Arabic script** on the page.
5. **English only** at launch.

6. **Provider**: Yunus Andreasson personally, in Sweden; contact
   yunus@edenmind.com (`web/src/site.ts`).

Owed before the legal pages are true in every line:

- Sign the data processing agreements with Supabase and Expo (the privacy
  policy says they process data under one).
- Turn on Cloudflare Web Analytics, or drop that sentence from the policy.
