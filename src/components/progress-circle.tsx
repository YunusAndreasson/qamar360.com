import Svg, { Circle, G, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { moonPhasePath } from '@/lib/moon';
import { ringMetrics } from '@/lib/progress';

/** The shadowed limb tint — the rest of the moon in a faint wash of its own moonlight. */
const MOON_FAINT = 0.16;
/** Future cells still show their phase, but dimmed so they read as "not yet reached". */
const MUTED_MOON_OPACITY = 0.42;
/**
 * The moon is context, the ring is the data — so every elapsed day's moon sits at one quiet,
 * UNIFORM brightness and lets the brighter ring lead. Completion is never encoded in the moon (that
 * would make the moon's colour jump at the done/not-done boundary, conflating calendar with task) —
 * it lives entirely in the ring. Future days dim further still (they're not yet reached).
 */
const RESTING_MOON_OPACITY = 0.72;

export function ProgressCircle({
  fraction,
  size,
  strokeWidth,
  active,
  muted,
  phase,
}: {
  fraction: number;
  size: number;
  strokeWidth: number;
  active: boolean;
  muted: boolean;
  /** When set, the interior shows the true moon at this phase instead of a flat disc. */
  phase?: { illumination: number; waxing: boolean };
}) {
  const theme = useTheme();
  const { isComplete, radius, ringRadius, circumference, arc } = ringMetrics(size, strokeWidth, fraction);
  // The moon sits a stroke-width inside the ring, so the ring always reads as a band around it.
  const moonR = ringRadius - strokeWidth;

  // The moon disc is warm moonlight — the celestial body (the calendar). Completion lives in the
  // ring around it, and carries the two-temperature signal: a partial/today arc is cool steel
  // ("in progress"), a complete day closes the ring in warm `complete` moonlight ("done") — so a
  // finished day reads warm, not as a same-hue saturation bump. (Warm = moon/done, cool = pace.)
  const trackColor = muted ? theme.accentTrackMuted : theme.accentTrack;
  const arcColor = muted
    ? theme.accentTrackMuted
    : isComplete
      ? theme.complete
      : active
        ? theme.accent
        : theme.accentTrackStrong;
  // The moon wears warm moonlight (the calendar); future days are greyed. Brightness is uniform
  // across elapsed days — completion is the ring's job, not the moon's — so the grid never reads as
  // a patchwork of warm/grey discs.
  const moonColor = muted ? theme.textDisabled : theme.complete;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {phase ? (
        // The moon as the interior: opaque shadow disc, a faint lit-side tint, then the true lit
        // region. One uniform quiet brightness for every elapsed day (the ring leads and carries
        // completion); future days dimmer still.
        <G opacity={muted ? MUTED_MOON_OPACITY : RESTING_MOON_OPACITY}>
          <Circle cx={radius} cy={radius} r={moonR} fill={theme.backgroundElement} />
          <Circle cx={radius} cy={radius} r={moonR} fill={moonColor} fillOpacity={MOON_FAINT} />
          {phase.illumination > 0.005 ? (
            <Path d={moonPhasePath(radius, radius, moonR, phase.illumination, phase.waxing)} fill={moonColor} />
          ) : null}
        </G>
      ) : (
        <Circle
          cx={radius}
          cy={radius}
          r={radius}
          fill={isComplete ? theme.complete : muted ? theme.accentTrackMuted : theme.accentTrack}
        />
      )}
      <Circle cx={radius} cy={radius} r={ringRadius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
      {arc > 0 ? (
        <Circle
          cx={radius}
          cy={radius}
          r={ringRadius}
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference}`}
          fill="none"
          transform={`rotate(-90 ${radius} ${radius})`}
        />
      ) : null}
    </Svg>
  );
}
