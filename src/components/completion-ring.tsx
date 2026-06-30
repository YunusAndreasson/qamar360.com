import Svg, { Circle, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { clamp01 } from '@/lib/progress';

/**
 * A checklist item's completion mark — a ring that resolves to a checkmark, NEVER a moon. A full
 * moon is a lunar-phase (calendar) idea; "task done" is a different idea, so the two are kept apart:
 * the Progress grid carries the moons, the daily checklist carries checks.
 *
 * Open is a quiet hollow ring (the row's press highlight shows through). A count goal fills the ring
 * partway in cool steel — the "in-progress" telemetry colour. At done the mark lights up: a warm
 * `complete` moonlight disc fills the ring and a check sits on it — the same warm "done" note the
 * Progress completion uses, set deliberately apart from the cool steel of a half-finished goal.
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
  const clamped = clamp01(fraction);
  const isComplete = clamped >= 1;
  const radius = size / 2;
  const ringRadius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const arc = circumference * clamped;

  // The check — two strokes inside the disc, scaled to the mark's size.
  const check = `M ${size * 0.3} ${size * 0.53} L ${size * 0.43} ${size * 0.67} L ${size * 0.72} ${size * 0.35}`;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {isComplete ? (
        <>
          {/* Lit: a warm moonlight disc fills the ring, a check rides on it (dark check on the light
              disc in dark mode, light check on the dark disc in light mode — `accentText` inverts the
              same way the disc does). */}
          <Circle cx={radius} cy={radius} r={ringRadius} fill={theme.complete} />
          <Path
            d={check}
            stroke={theme.accentText}
            strokeWidth={Math.max(2, strokeWidth)}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <Circle cx={radius} cy={radius} r={ringRadius} stroke={theme.accentTrack} strokeWidth={strokeWidth} fill="none" />
          {arc > 0 ? (
            <Circle
              cx={radius}
              cy={radius}
              r={ringRadius}
              stroke={theme.accentTrackStrong}
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
