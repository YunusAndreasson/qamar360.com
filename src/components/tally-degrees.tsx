import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { useTallyUp } from '@/hooks/use-tally-up';

/**
 * A degrees readout, isolated so the tally's ~60fps re-renders touch only this text — the
 * ring/orbit SVG siblings stay still. Tallied over `Duration.orbit` with the sweep's own
 * easing, so the number and the arc land on the same frame: one instrument, not two animations.
 * Shared by the Progress hero and a single habit's Insights hero.
 */
export function TallyDegrees({ degrees }: { degrees: number }) {
  const shown = useTallyUp(degrees, Duration.orbit);
  return <ThemedText type="display">{shown}°</ThemedText>;
}
