import {
  STARTER_STACKS,
  STARTER_STANDALONE_PRESET_IDS,
  type StarterStack,
  type SunnahPreset,
} from '@/constants/sunnah-habits';
import { normalizeName } from '@/lib/names';

/**
 * Planning for Discover's "starter stacks" card: which presets still need creating, grouped
 * into the stacks they'll land in. Pure — the screen resolves the plan against the live
 * catalog and current habits/stacks, then executes it (createHabits → createStack/updateStack).
 */

type StarterGroup = {
  /** The stack name to create — or that matched an existing stack (see `existingStackId`). */
  name: string;
  /** The day-part anchor a freshly created stack is stamped with (an existing stack keeps its own). */
  dayPart: StarterStack['dayPart'];
  /** A same-named stack the user already has: append there instead of creating a twin. */
  existingStackId: string | null;
  /** The presets still to add, in stack sequence order. */
  presets: SunnahPreset[];
};

export type StarterPlan = {
  groups: StarterGroup[];
  /** Presets added standalone (no time-of-day home), after the stacks. */
  lone: SunnahPreset[];
  /** Every preset the plan would add — drives the card's count and visibility. */
  total: number;
};

/**
 * Build the starter plan: resolve ids against the live catalog (missing ids drop out),
 * skip presets whose folded name is already a habit, drop groups that end up empty, and
 * match group names against existing stacks (same fold as every other name collision).
 */
export function buildStarterPlan(
  presets: SunnahPreset[],
  existingHabitNames: Set<string>,
  stacks: { id: string; name: string }[],
  starterStacks: StarterStack[] = STARTER_STACKS,
  standaloneIds: string[] = STARTER_STANDALONE_PRESET_IDS,
): StarterPlan {
  const byId = new Map(presets.map((p) => [p.id, p]));
  const remaining = (ids: string[]) =>
    ids
      .map((id) => byId.get(id))
      .filter((p): p is SunnahPreset => p !== undefined && !existingHabitNames.has(normalizeName(p.name)));

  const groups: StarterGroup[] = [];
  for (const starter of starterStacks) {
    const groupPresets = remaining(starter.presetIds);
    if (groupPresets.length === 0) continue;
    const twin = stacks.find((s) => normalizeName(s.name) === normalizeName(starter.name)) ?? null;
    groups.push({
      name: starter.name,
      dayPart: starter.dayPart,
      existingStackId: twin?.id ?? null,
      presets: groupPresets,
    });
  }
  const lone = remaining(standaloneIds);
  const total = groups.reduce((n, g) => n + g.presets.length, 0) + lone.length;
  return { groups, lone, total };
}
