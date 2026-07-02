import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { ringMetrics } from '@/lib/progress';

/**
 * A checklist item's completion mark — a ring that resolves to a check, NEVER a moon. A full moon
 * is a lunar-phase (calendar) idea; "task done" is a different idea, so the two are kept apart:
 * the Progress grid carries the moons, the daily checklist carries this ring.
 *
 * Open is a quiet hollow ring (the row's press highlight shows through). A count goal fills the
 * ring partway in the accent steel — clearly apart from the `controlTrack` outline (the old
 * `accentTrackStrong` fill was near-identical to the track, so partial progress was unreadable).
 * At done the mark does NOT light up: the ring closes around a small check, both in `textDisabled`
 * — the exact muted tone of the struck-through label — so a finished habit recedes as one quiet
 * unit rather than shouting a bright checkmark. A check, not a filled dot: ring-with-dot reads as
 * a radio button's "selected", and a solid disc reads as a moon (which belongs to Progress).
 */
export function CompletionRing({
  fraction,
  size,
  strokeWidth,
}: {
  /** Completion 0–1 — a binary habit is 0 or 1; a count goal is count ÷ target. */
  fraction: number;
  size: number;
  strokeWidth: number;
}) {
  const theme = useTheme();
  const { isComplete, radius, ringRadius, circumference, arc } = ringMetrics(size, strokeWidth, fraction);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {isComplete ? (
        <>
          <Circle cx={radius} cy={radius} r={ringRadius} stroke={theme.textDisabled} strokeWidth={strokeWidth} fill="none" />
          <Path
            d={`M ${size * 0.31} ${size * 0.52} L ${size * 0.44} ${size * 0.65} L ${size * 0.69} ${size * 0.37}`}
            stroke={theme.textDisabled}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <Circle cx={radius} cy={radius} r={ringRadius} stroke={theme.controlTrack} strokeWidth={strokeWidth} fill="none" />
          {arc > 0 ? (
            // Keyed on the arc length: a count-goal stepper re-renders this element in place on
            // every tap (same position in the tree, only `strokeDasharray` changing), and on the
            // New Architecture that in-place native prop update doesn't reliably repaint — the
            // ring stays stuck at its first-drawn arc. Forcing a fresh native view per value
            // (rather than trusting Fabric to commit the updated prop) is the same tactic already
            // used for the Reanimated entering/exiting Fabric bug elsewhere in this app.
            <Circle
              key={arc}
              cx={radius}
              cy={radius}
              r={ringRadius}
              stroke={theme.accent}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${arc} ${circumference}`}
              fill="none"
              transform={`rotate(-90 ${radius} ${radius})`}
            />
          ) : null}
        </>
      )}
    </Svg>
  );
}
