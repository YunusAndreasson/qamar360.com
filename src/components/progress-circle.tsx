import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';
import { clamp01 } from '@/lib/progress';

export function ProgressCircle({
  fraction,
  size,
  strokeWidth,
  active = false,
  muted = false,
}: {
  fraction: number;
  size: number;
  strokeWidth: number;
  active?: boolean;
  muted?: boolean;
}) {
  const theme = useTheme();
  const clamped = clamp01(fraction);
  const isComplete = clamped >= 1;
  const radius = size / 2;
  const ringRadius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * ringRadius;
  const arc = circumference * clamped;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={radius}
        cy={radius}
        r={radius}
        fill={isComplete ? theme.complete : muted ? theme.accentTrackMuted : theme.accentTrack}
      />
      <Circle
        cx={radius}
        cy={radius}
        r={ringRadius}
        stroke={isComplete ? theme.complete : active ? theme.accentTrackStrong : theme.accentTrack}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {arc > 0 && !isComplete ? (
        <Circle
          cx={radius}
          cy={radius}
          r={ringRadius}
          stroke={muted ? theme.accentTrackMuted : active ? theme.accent : theme.accentTrackStrong}
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
