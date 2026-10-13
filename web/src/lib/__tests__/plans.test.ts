import { describe, expect, it } from 'vitest'

import type { Plan, PlanTask } from '../plans'
import { MAX_PLAN_BODY, clampBody, planExcerpt, scheduledByPlan, scheduledLabel } from '../plans'

// Expectations below are derived from intended behaviour, never copied from the current output —
// so a test going red means the code is wrong, not the test.

const TODAY = '2026-08-30'
const TOMORROW = '2026-08-31'

const task = (overrides: Partial<PlanTask> = {}): PlanTask => ({
  id: 't1',
  title: 'Ferry tickets',
  due_on: TODAY,
  plan_id: 'p1',
  ...overrides,
})

const plan = (overrides: Partial<Plan> = {}): Plan => ({
  id: 'p1',
  user_id: 'u1',
  title: 'Denmark with the family',
  body: '',
  position: 0,
  created_at: null,
  updated_at: null,
  ...overrides,
})

describe('scheduledLabel', () => {
  it('names today', () => {
    expect(scheduledLabel(TODAY, TODAY)).toBe('On today’s list')
  })

  it('names tomorrow', () => {
    expect(scheduledLabel(TOMORROW, TODAY)).toBe('On tomorrow’s list')
  })

  // An open to-do from an earlier day shows on today on the phone, so today is where it honestly
  // is — the plan should not send you looking for it on a day that has passed.
  it('says today for one that has carried forward', () => {
    expect(scheduledLabel('2026-08-24', TODAY)).toBe('On today’s list')
  })
})

describe('planExcerpt', () => {
  it('takes the first line that has anything on it', () => {
    expect(planExcerpt('\n\n  Legoland, and the beach at Skagen.\nFerry from Ystad.')).toBe(
      'Legoland, and the beach at Skagen.',
    )
  })

  it('collapses a run of spaces inside the line', () => {
    expect(planExcerpt('New   felt   for the roof')).toBe('New felt for the roof')
  })

  // A plan that is still only a name renders no second line at all, rather than an empty one.
  it('is nothing when there are no notes', () => {
    expect(planExcerpt('   \n  ')).toBe(null)
  })

  it('cuts a long line to one ellipsis, never past the limit', () => {
    const excerpt = planExcerpt('x'.repeat(200), 10)
    expect(excerpt).toBe(`${'x'.repeat(9)}…`)
    expect(excerpt).toHaveLength(10)
  })
})

describe('scheduledByPlan', () => {
  it('finds nothing in an empty list', () => {
    expect(scheduledByPlan([]).size).toBe(0)
  })

  it('files a to-do under the plan it came from', () => {
    const byPlan = scheduledByPlan([task()])
    expect(byPlan.get(plan().id)?.title).toBe('Ferry tickets')
  })

  // The soonest one is the one worth telling you about: a plan with something on today and
  // something next week should say today.
  it('keeps the soonest when a plan has put out several', () => {
    const byPlan = scheduledByPlan([
      task({ id: 'a', due_on: '2026-09-05', title: 'Pack the car' }),
      task({ id: 'b', due_on: TOMORROW, title: 'Ferry tickets' }),
    ])
    expect(byPlan.get('p1')?.title).toBe('Ferry tickets')
  })

  it('keeps two plans apart', () => {
    const byPlan = scheduledByPlan([task({ id: 'a' }), task({ id: 'b', plan_id: 'p2', title: 'Roof felt' })])
    expect(byPlan.get('p2')?.title).toBe('Roof felt')
    expect(byPlan.size).toBe(2)
  })
})

describe('clampBody', () => {
  it('leaves text the database would accept exactly as written', () => {
    const body = 'A short note.'
    expect(clampBody(body, MAX_PLAN_BODY)).toBe(body)
  })

  it('keeps text sitting precisely on the limit', () => {
    const body = 'a'.repeat(MAX_PLAN_BODY)
    expect(clampBody(body, MAX_PLAN_BODY)).toHaveLength(MAX_PLAN_BODY)
  })

  it('cuts an over-long paste down to the limit instead of letting the write fail', () => {
    expect(clampBody('a'.repeat(5000), MAX_PLAN_BODY)).toHaveLength(MAX_PLAN_BODY)
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

