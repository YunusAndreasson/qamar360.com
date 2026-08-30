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
 * A plan has two halves, and they are deliberately separate: habits to create, and habits the user
 * already keeps that the stack should gather in. See {@link buildCuratedPlan} for why.
 */

/** The habit row an act becomes — structurally the `HabitCreate` the habits hook accepts. */
export type HabitInput = {
  name: string;
  preset_id: string;
  schedule_days: number[];
  hijri_schedule: HijriSchedule | null;
  target_count: number | null;
  target_unit: string | null;
};

/**
 * One act of a plan, in the stack's own sequence: a habit the user already keeps — gathered in,
 * id and history intact — or one still to be created.
 */
type PlannedAct = { kind: 'own'; habitId: string } | { kind: 'new'; input: HabitInput };

/** The habits the planner reads: identity, the name it dedupes on, and where the act sits today. */
export type OwnedHabit = { id: string; name: string; stack_id: string | null };

export type CuratedPlan = {
  /** The stack name to create — or that matched `existingStackId`. */
  name: string;
  /** The anchor a freshly created stack is stamped with (an existing stack keeps its own). */
  moment: MomentKey;
  /** A same-named stack the user already has: append there instead of creating a twin. */
  existingStackId: string | null;
  /** The habit rows still to create, in stack sequence order. */
  inputs: HabitInput[];
  /** The whole membership in sequence — what the stack holds once the plan has run. */
  acts: PlannedAct[];
  /** Acts the user already keeps that this plan will MOVE into the stack: they sit loose, or in
   *  another stack, today. Counted apart from `inputs` because it is the one half of a plan that
   *  rearranges something the user set up themselves — so the card has to say it out loud. */
  gatherIds: string[];
};

/**
 * The habit row a preset becomes. `schedule` overrides the preset's own weekdays (a weekly stack
 * borrowing an otherwise-daily act); a Hijri preset is never overridden — its recurrence lives in
 * `hijri_schedule` and its weekday list is empty by contract.
 */
export function habitInputFor(preset: SunnahPreset, schedule?: number[]): HabitInput {
  return {
    name: preset.name,
    preset_id: preset.id,
    // Hijri presets store empty weekdays + a hijri_schedule; weekly presets the reverse.
    schedule_days: preset.hijriSchedule ? [] : (schedule ?? preset.defaultSchedule),
    hijri_schedule: preset.hijriSchedule ?? null,
    // A few presets are naturally counted (cups, servings); the rest stay binary.
    target_count: preset.targetCount ?? null,
    target_unit: preset.targetUnit ?? null,
  };
}

/**
 * Resolve one curated stack against what the user already has.
 *
 * Owning the acts and having the stack are two different things, and reading the first as the
 * second was a trap. A user who already kept every Ḍuḥā act as an ordinary habit was shown
 * "Already yours" over a stack that did not exist, and the only way to make the card offer
 * anything again was to delete one of their own habits first. So an act already kept is
 * *gathered* into the stack rather than skipped — it keeps its id, and with it every tick it has
 * ever earned — and only a stack that exists AND already holds every act has nothing left to do.
 *
 * The rest is what the old starter card proved: ids missing from the live catalog drop out
 * silently, an act matches by its *folded* name (a habit saved before the preset gained its
 * diacritics still counts as the same act), and a same-named stack the user already keeps is
 * appended to rather than twinned.
 */
export function buildCuratedPlan(
  curated: CuratedStack,
  presets: SunnahPreset[],
  habits: readonly OwnedHabit[],
  stacks: { id: string; name: string }[],
): CuratedPlan | null {
  const byId = new Map(presets.map((p) => [p.id, p]));
  // First match wins, so a user holding the same act twice never has both gathered into one stack.
  const owned = new Map<string, OwnedHabit>();
  for (const habit of habits) {
    const key = normalizeName(habit.name);
    if (!owned.has(key)) owned.set(key, habit);
  }
  const twin = stacks.find((s) => normalizeName(s.name) === normalizeName(curated.name)) ?? null;

  const acts: PlannedAct[] = [];
  const inputs: HabitInput[] = [];
  const gatherIds: string[] = [];
  for (const act of curated.acts) {
    const preset = byId.get(act.presetId);
    if (!preset) continue; // id missing from the live catalog — drop it, don't crash
    const already = owned.get(normalizeName(preset.name));
    if (already) {
      acts.push({ kind: 'own', habitId: already.id });
      // An act already sitting in the very stack being built moves nowhere.
      if (!twin || already.stack_id !== twin.id) gatherIds.push(already.id);
    } else {
      const input = habitInputFor(preset, act.schedule);
      inputs.push(input);
      acts.push({ kind: 'new', input });
    }
  }
  if (inputs.length === 0 && gatherIds.length === 0) return null;
  return { name: curated.name, moment: curated.moment, existingStackId: twin?.id ?? null, inputs, acts, gatherIds };
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
