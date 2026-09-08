import { describe, expect, it } from 'vitest'

import { parseGeneratedInsight, parseInsightRequest, responseJson } from './personalized-insights'

const request = {
  calendar: { hijriOffset: 0, utcOffsetMinutes: 0 },
  reading: {
    id: '1448-4-1',
    publishedISO: '2026-09-19',
    span: { startISO: '2026-09-12', endISO: '2026-09-18', days: 7, milestone: 1 },
    quarter: { earned: 4, possible: 7, rate: 4 / 7, sealedDays: 2, longestRunDays: 2 },
    previous: null,
    habits: [{ id: 'habit-1', earned: 4, possible: 7 }],
  },
}

describe('parseInsightRequest', () => {
  it('accepts a coherent closed Umm al-Qura quarter', () => {
    expect(parseInsightRequest(request, request.reading.id, new Date('2026-09-20T00:00:00Z'))).not.toBeNull()
  })

  it('rejects tampered totals and route ids', () => {
    expect(parseInsightRequest(request, '1448-4-8', new Date('2026-09-20T00:00:00Z'))).toBeNull()
    expect(
      parseInsightRequest(
        { ...request, reading: { ...request.reading, quarter: { ...request.reading.quarter, earned: 7 } } },
        request.reading.id,
        new Date('2026-09-20T00:00:00Z'),
      ),
    ).toBeNull()
  })

  it('validates quarter coordinates with the configured Hijri offset', () => {
    const shifted = {
      ...request,
      calendar: { ...request.calendar, hijriOffset: 1 },
      reading: {
        ...request.reading,
        publishedISO: '2026-09-18',
        span: { ...request.reading.span, startISO: '2026-09-11', endISO: '2026-09-17' },
      },
    }
    expect(parseInsightRequest(shifted, shifted.reading.id, new Date('2026-09-20T00:00:00Z'))).not.toBeNull()
    expect(
      parseInsightRequest(
        { ...shifted, calendar: { ...shifted.calendar, hijriOffset: 0 } },
        shifted.reading.id,
        new Date('2026-09-20T00:00:00Z'),
      ),
    ).toBeNull()
  })

  it('accepts a quarter closed at local midnight east of UTC', () => {
    const eastOfUtc = { ...request, calendar: { ...request.calendar, utcOffsetMinutes: 120 } }
    expect(parseInsightRequest(eastOfUtc, eastOfUtc.reading.id, new Date('2026-09-18T22:30:00Z'))).not.toBeNull()
    expect(
      parseInsightRequest(request, request.reading.id, new Date('2026-09-18T22:30:00Z')),
    ).toBeNull()
  })

  it('rejects impossible dates without throwing', () => {
    const malformed = { ...request, reading: { ...request.reading, publishedISO: '2026-99-99' } }
    expect(() => parseInsightRequest(malformed, malformed.reading.id)).not.toThrow()
    expect(parseInsightRequest(malformed, malformed.reading.id)).toBeNull()

    const normalizedByDate = {
      ...request,
      reading: { ...request.reading, span: { ...request.reading.span, startISO: '2026-02-30' } },
    }
    expect(parseInsightRequest(normalizedByDate, normalizedByDate.reading.id)).toBeNull()
  })
})

describe('the goals block', () => {
  const at = new Date('2026-09-20T00:00:00Z')
  const goal = {
    id: 'goal-1',
    target: 9060,
    direction: 'up' as const,
    earned: 1240,
    remaining: 7820,
    quota: 151,
    quotaRemaining: 96,
    monthsLeft: 59,
    pace: null,
    measured: false,
    met: false,
    overdue: false,
  }
  const withGoals = (goals: unknown) => parseInsightRequest({ ...request, goals }, request.reading.id, at)

  // `null` is a value here, not a gap: `pace` says "no month has closed yet" and `quota` says "not
  // being asked for anything". A validator that only took numbers would reject an ordinary new goal.
  it('accepts the nullable measures a new goal really has', () => {
    expect(withGoals([{ ...goal, quota: null, quotaRemaining: null, pace: null }])?.goals).toHaveLength(1)
  })

  // An app built before this field existed sends no key at all, and must keep getting insights.
  it('treats an absent block as no goals', () => {
    expect(parseInsightRequest(request, request.reading.id, at)?.goals).toEqual([])
  })

  it('rejects a malformed, duplicated, unbounded or over-long block', () => {
    expect(withGoals([{ ...goal, direction: 'sideways' }])).toBeNull()
    expect(withGoals([{ ...goal, remaining: -1 }])).toBeNull()
    expect(withGoals([{ ...goal, target: 1e12 }])).toBeNull()
    expect(withGoals([{ ...goal, met: 'yes' }])).toBeNull()
    expect(withGoals([goal, goal])).toBeNull()
    expect(withGoals(Array.from({ length: 51 }, (_, i) => ({ ...goal, id: `goal-${i}` })))).toBeNull()
    expect(withGoals('none')).toBeNull()
  })
})

describe('Workers AI response validation', () => {
  it('extracts an OpenAI-style JSON response and restricts evidence to the allowlist', () => {
    const parsed = responseJson({
      choices: [{ message: { content: '{"paragraphs":["One","Two","Three"],"next_step":"Begin small.","evidence_preset_id":"fajr"}' } }],
    })
    expect(parseGeneratedInsight(parsed, new Set(['fajr']))).toEqual({
      paragraphs: ['One', 'Two', 'Three'],
      next_step: 'Begin small.',
      evidence_preset_id: 'fajr',
    })
    expect(parseGeneratedInsight(parsed, new Set())).toBeNull()
  })

  it('rejects dumped text instead of three readable paragraphs', () => {
    expect(
      parseGeneratedInsight({ paragraphs: ['one block'], next_step: 'Try', evidence_preset_id: null }, new Set()),
    ).toBeNull()
  })
})
