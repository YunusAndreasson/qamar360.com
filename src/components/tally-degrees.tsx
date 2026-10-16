import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { useTallyUp } from '@/hooks/use-tally-up';
import { formatDegrees, orbitDegrees } from '@/lib/progress-format';

/**
 * A degrees readout, isolated so the tally's ~60fps re-renders touch only this text — the
 * ring/orbit SVG siblings stay still. Tallied over `Duration.orbit` with the sweep's own easing,
 * so the number and the arc land on the same frame: one instrument, not two animations. Shared by
 * the Progress hero and a single habit's Stats hero.
 *
 * It counts to the GUARDED figure ({@link orbitDegrees}), so a month a hair short of whole comes
 * to rest on 359°, not 360°. `null` — nothing to measure yet — reads `—` rather than a score of 0°.
 */
export function TallyDegrees({ rate }: { rate: number | null }) {
  const shown = useTallyUp(rate === null ? 0 : orbitDegrees(rate), Duration.orbit);
  return <ThemedText type="display">{rate === null ? formatDegrees(null) : `${shown}°`}</ThemedText>;
}
