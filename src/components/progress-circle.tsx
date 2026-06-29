import Svg, { Circle, G, Path } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { moonPhasePath } from '@/lib/moon';
import { clamp01 } from '@/lib/progress';

/** The shadowed limb tint — the rest of the moon in a faint wash of its own gold. */
const MOON_FAINT = 0.16;
/** Future cells still show their phase, but dimmed so they read as "not yet reached". */
const MUTED_MOON_OPACITY = 0.42;

export function ProgressCircle({
  fraction,
  size,
  strokeWidth,
  active = false,
  muted = false,
  phase,
}: {
  fraction: number;
  size: number;
  strokeWidth: number;
  active?: boolean;
  muted?: boolean;
  /** When set, the interior shows the true moon at this phase instead of a flat disc. */
  phase?: { illumination: number; waxing: boolean };
}) {
  const theme = useTheme();
  const clamped = clamp01(fraction);
  const isComplete = clamped >= 1;
  const radius = size / 2;
  const ringRadius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const arc = circumference * clamped;
  // The moon sits a stroke-width inside the ring, so the ring always reads as a band around it.
  const moonR = ringRadius - strokeWidth;

  // The moon itself is gold — the celestial body. Progress lives entirely in the purple ring:
  // a fuller arc = more done, a full bright ring = the day complete. (Gold = moon, purple = pace.)
  const trackColor = muted ? theme.accentTrackMuted : theme.accentTrack;
  const arcColor = muted ? theme.accentTrackMuted : active || isComplete ? theme.accent : theme.accentTrackStrong;
  // Elapsed days wear the moon's gold; days still to come are greyed — so how far the gold has
  // spread across the grid reads at a glance as how much of the month has passed. (The ring arc
  // still carries that day's completion; disc hue = elapsed, ring = done.)
  const moonColor = muted ? theme.textDisabled : theme.complete;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {phase ? (
        // The moon as the interior: opaque shadow disc, a faint lit-side tint, then the true lit region.
        <G opacity={muted ? MUTED_MOON_OPACITY : 1}>
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
