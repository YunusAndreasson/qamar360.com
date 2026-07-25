import { CURATED_STACKS, type CuratedStack } from '@/constants/curated-stacks';
import type { SunnahPreset } from '@/constants/sunnah-habits';
import type { HijriSchedule } from '@/lib/dates';
import type { MomentKey } from '@/lib/moments';
import { normalizeName } from '@/lib/names';

/**
 * Planning for the ready-made stacks. Pure — a screen resolves a {@link CuratedStack} against the
 * live catalog and the user's current habits/stacks, then executes the returned plan
 * (`createHabits` → `createStack` / `updateStack`).
 *
 * The rules are the ones the old starter card proved: ids missing from the live catalog drop out
 * silently, an act whose *folded* name the user already has is skipped (so adding a second stack
 * never mints a near-duplicate habit), and a same-named stack the user already keeps is appended
 * to rather than twinned.
 */

/** The habit row an act becomes — structurally the `HabitCreate` the habits hook accepts. */
export type HabitInput = {
  name: string;
  schedule_days: number[];
  hijri_schedule: HijriSchedule | null;
  target_count: number | null;
  target_unit: string | null;
};

export type CuratedPlan = {
  /** The stack name to create — or that matched `existingStackId`. */
  name: string;
  /** The anchor a freshly created stack is stamped with (an existing stack keeps its own). */
  moment: MomentKey;
  /** A same-named stack the user already has: append there instead of creating a twin. */
  existingStackId: string | null;
  /** The habit rows still to create, in stack sequence order. */
  inputs: HabitInput[];
};

/**
 * The habit row a preset becomes. `schedule` overrides the preset's own weekdays (a weekly stack
 * borrowing an otherwise-daily act); a Hijri preset is never overridden — its recurrence lives in
 * `hijri_schedule` and its weekday list is empty by contract.
 */
export function habitInputFor(preset: SunnahPreset, schedule?: number[]): HabitInput {
  return {
    name: preset.name,
    // Hijri presets store empty weekdays + a hijri_schedule; weekly presets the reverse.
    schedule_days: preset.hijriSchedule ? [] : (schedule ?? preset.defaultSchedule),
    hijri_schedule: preset.hijriSchedule ?? null,
    // A few presets are naturally counted (cups, servings); the rest stay binary.
    target_count: preset.targetCount ?? null,
    target_unit: preset.targetUnit ?? null,
  };
}

/**
 * Resolve one curated stack against what the user already has. Returns `null` when every act is
 * already owned — the library reads that as "added" and offers nothing to do.
 */
export function buildCuratedPlan(
  curated: CuratedStack,
  presets: SunnahPreset[],
  existingHabitNames: Set<string>,
  stacks: { id: string; name: string }[],
): CuratedPlan | null {
  const byId = new Map(presets.map((p) => [p.id, p]));
  const inputs: HabitInput[] = [];
  for (const act of curated.acts) {
    const preset = byId.get(act.presetId);
    if (!preset) continue; // id missing from the live catalog — drop it, don't crash
    if (existingHabitNames.has(normalizeName(preset.name))) continue; // already owned
    inputs.push(habitInputFor(preset, act.schedule));
  }
  if (inputs.length === 0) return null;
  const twin = stacks.find((s) => normalizeName(s.name) === normalizeName(curated.name)) ?? null;
  return { name: curated.name, moment: curated.moment, existingStackId: twin?.id ?? null, inputs };
}

/**
 * Folded habit name → the moment of the curated stack that act belongs to. Drives the one-time
 * "Anchor these" card: a habit the user added back when habits could float loose is offered the
 * anchor the library would have given it. A name the library doesn't know maps to nothing, and
 * the user picks its moment by hand.
 */
export function suggestedMoments(
  presets: SunnahPreset[],
  curated: CuratedStack[] = CURATED_STACKS,
): Map<string, MomentKey> {
  const byId = new Map(presets.map((p) => [p.id, p]));
  const out = new Map<string, MomentKey>();
  for (const stack of curated) {
    for (const act of stack.acts) {
      const preset = byId.get(act.presetId);
      if (preset) out.set(normalizeName(preset.name), stack.moment);
    }
  }
  return out;
}
