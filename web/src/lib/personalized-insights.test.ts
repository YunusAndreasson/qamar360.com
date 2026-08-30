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
