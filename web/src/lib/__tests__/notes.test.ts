import { describe, expect, it } from 'vitest'

import { addDaysISO, hijriMonthRange, hijriParts } from '../dates'
import {
  clampBody,
  journalMonths,
  MAX_NOTE_LENGTH,
  noteExcerpt,
  readingMinutes,
  wordCount,
  type JournalEntry,
} from '../notes'

// Expectations below are derived from *intended* behaviour ("a reflection you can read in
// under a minute still reads as one minute"), never copied from the current output — so a
// test going red means the code is wrong, not the test.

const entry = (note_date: string, body = 'A reflection.'): JournalEntry => ({
  id: note_date,
  note_date,
  body,
  updated_at: `${note_date}T12:00:00+00:00`,
})

describe('wordCount', () => {
  it('nothing written is no words, whitespace included', () => {
    expect(wordCount('')).toBe(0)
    expect(wordCount('   \n\n  ')).toBe(0)
  })

  it('counts runs of non-whitespace across line breaks and double spaces', () => {
    expect(wordCount('One two\nthree   four')).toBe(4)
  })

  it('punctuation rides along with its word rather than counting separately', () => {
    expect(wordCount('Alḥamdulillāh, today was calm.')).toBe(4)
  })

  it('leading and trailing whitespace does not inflate the count', () => {
    expect(wordCount('\n  Fajr on time  \n')).toBe(3)
  })
})

describe('readingMinutes', () => {
  it('nothing written takes no time to read', () => {
    expect(readingMinutes(0)).toBe(0)
  })

  it('anything written at all reads as a minute', () => {
    expect(readingMinutes(1)).toBe(1)
    expect(readingMinutes(199)).toBe(1)
  })

  it('rounds up to the next whole minute at 200 words a minute', () => {
    expect(readingMinutes(200)).toBe(1)
    expect(readingMinutes(201)).toBe(2)
    expect(readingMinutes(450)).toBe(3)
  })
})

describe('clampBody', () => {
  it('leaves text the database would accept exactly as written', () => {
    const body = 'A short reflection.'
    expect(clampBody(body)).toBe(body)
  })

  it('keeps text sitting precisely on the limit', () => {
    const body = 'a'.repeat(MAX_NOTE_LENGTH)
    expect(clampBody(body)).toHaveLength(MAX_NOTE_LENGTH)
  })

  it('cuts an over-long paste down to the limit instead of letting the write fail', () => {
    expect(clampBody('a'.repeat(5000))).toHaveLength(MAX_NOTE_LENGTH)
  })

  it('never cuts an emoji in half — the DB rejects the invalid UTF-8 that would make', () => {
    // '🌙' is one code point and two UTF-16 units, so a cut at 3 lands inside it.
    const clamped = clampBody('ab🌙cd', 3)
    expect(clamped).toBe('ab')
    expect(clamped.split('').every((ch) => ch.charCodeAt(0) < 0xd800)).toBe(true)
  })

  it('keeps a whole emoji when the cut falls after it', () => {
    expect(clampBody('ab🌙cd', 4)).toBe('ab🌙')
  })
})

describe('noteExcerpt', () => {
  it('an empty reflection has no excerpt', () => {
    expect(noteExcerpt('')).toBe('')
    expect(noteExcerpt('\n\n   \n')).toBe('')
  })

  it('skips blank lines to the first line that has words in it', () => {
    expect(noteExcerpt('\n\n  \nFajr was easy today')).toBe('Fajr was easy today')
  })

  it('drops a heading marker so the excerpt reads as a sentence', () => {
    expect(noteExcerpt('# Fajr was easy')).toBe('Fajr was easy')
    expect(noteExcerpt('### A quieter day')).toBe('A quieter day')
  })

  it('drops list and quote markers', () => {
    expect(noteExcerpt('- Read after ʿAṣr')).toBe('Read after ʿAṣr')
    expect(noteExcerpt('1. Read after ʿAṣr')).toBe('Read after ʿAṣr')
    expect(noteExcerpt('> Read after ʿAṣr')).toBe('Read after ʿAṣr')
  })

  it('unwraps paired emphasis but leaves a lone asterisk where the writer put it', () => {
    expect(noteExcerpt('**Steady** all week')).toBe('Steady all week')
    expect(noteExcerpt('_Steady_ all week')).toBe('Steady all week')
    expect(noteExcerpt('Woke at 5 * still tired')).toBe('Woke at 5 * still tired')
  })

  it('trims to the limit and marks the cut with an ellipsis', () => {
    const excerpt = noteExcerpt('word '.repeat(60), 20)
    expect(excerpt).toHaveLength(20)
    expect(excerpt.endsWith('…')).toBe(true)
  })
})

describe('journalMonths', () => {
  it('sanity: the test runtime has the Umm al-Qura calendar', () => {
    expect(hijriParts('2026-08-30')).not.toBeNull()
  })

  const month = hijriMonthRange('2026-08-30')
  if (!month) throw new Error('This runtime lacks the Umm al-Qura calendar')
  const secondDay = addDaysISO(month.start, 1)
  const nextMonthStart = addDaysISO(month.end, 1)

  it('an empty archive has no months', () => {
    expect(journalMonths([])).toEqual([])
  })

  it('two days in the same Hijri month file under one heading', () => {
    const groups = journalMonths([entry(month.start), entry(secondDay)])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.entries.map((e) => e.note_date)).toEqual([secondDay, month.start])
  })

  it('the heading names the Hijri month and year the days fall in', () => {
    const [group] = journalMonths([entry(month.start)])
    expect(group?.label).toBe(`${month.monthName} ${month.year}`)
  })

  it('a day in the next Hijri month opens its own heading', () => {
    const groups = journalMonths([entry(month.start), entry(nextMonthStart)])
    expect(groups).toHaveLength(2)
  })

  it('months come out newest first, whatever order the rows arrived in', () => {
    const groups = journalMonths([entry(month.start), entry(nextMonthStart)])
    expect(groups[0]?.entries[0]?.note_date).toBe(nextMonthStart)
    expect(groups[1]?.entries[0]?.note_date).toBe(month.start)
  })

  it('does not mutate the array it was handed', () => {
    const rows = [entry(month.start), entry(nextMonthStart)]
    journalMonths(rows)
    expect(rows.map((e) => e.note_date)).toEqual([month.start, nextMonthStart])
  })
})
