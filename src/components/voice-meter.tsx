import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Duration } from '@/constants/motion';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The bars that move while you speak.
 *
 * This is the single most important thing on the recording sheet, and not because it is pretty.
 * A microphone gives no evidence of itself: the app can be perfectly, silently broken — a denied
 * permission, a session another app is holding, a stream that opened onto nothing — and look
 * exactly like an app that is listening. A meter that answers *your own voice* is the only
 * signifier that can tell those two apart, and the user reads it without being taught.
 *
 * It moves in a beat of its own from the words landing above it: the meter is continuous ("it
 * hears me"), a sentence arriving is discrete ("it understood me"). Neither alone is enough.
 *
 * **Zero React renders.** The level is a shared value written straight from the audio callback ten
 * times a second (see `hooks/use-dictation.ts`) and read here on the UI thread. Routing that
 * through state would re-render the sheet — the whole sheet, holding a focused text field — ten
 * times a second, which is exactly the shape of jank that would make dictation feel cheap.
 */

/** Odd, so there is a true centre for the weight curve to peak on. */
const BAR_COUNT = 9;
const BAR_HEIGHT = 34;
/** How short a bar sits when nothing is being said. Never zero: a row of invisible bars reads as a
 *  broken control, where a row of quiet ones reads as a control that is waiting. */
const REST = 0.12;

/**
 * How much of the level each bar takes, tallest in the middle.
 *
 * Uniform bars scaled by one number look like a graphic equaliser with its input muted — every bar
 * identical, moving as one block. The curve turns the same single number into something that reads
 * as a voice: a shape with a centre.
 */
const WEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const distance = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
  return 0.35 + 0.65 * Math.cos((distance * Math.PI) / 2);
});

/** Slightly different settle times across the row, so the bars arrive a few milliseconds apart
 *  rather than snapping in perfect unison — the difference between a waveform and a bar chart. */
const SETTLE_MS = Array.from({ length: BAR_COUNT }, (_, i) => Duration.fast + (i % 3) * 22);

function Bar({ level, index, live }: { level: SharedValue<number>; index: number; live: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const style = useAnimatedStyle(() => {
    const target = live ? REST + level.get() * WEIGHTS[index]! * (1 - REST) : REST;
    return {
      transform: [{ scaleY: reduceMotion ? target : withTiming(target, { duration: SETTLE_MS[index]! }) }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: live ? theme.accent : theme.accentTrackMuted },
        style,
      ]}
    />
  );
}

/**
 * @param live False before the first audio buffer arrives, and after recording stops — the bars
 * fall to rest and lose their accent, so "armed but not yet hearing anything" never looks the same
 * as "hearing silence".
 */
export function VoiceMeter({ level, live }: { level: SharedValue<number>; live: boolean }) {
  return (
    <View
      style={styles.row}
      // One element, described once. Nine animated bars each announcing themselves would make the
      // sheet unusable with a screen reader, and the state they show is spoken by the status line
      // beside them anyway.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {WEIGHTS.map((_, i) => (
        <Bar key={i} level={level} index={i} live={live} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: BAR_HEIGHT,
  },
  // Scaled rather than resized: `scaleY` runs on the UI thread and drives no layout, where an
  // animated `height` would re-lay-out the sheet ten times a second.
  bar: { width: 3, height: BAR_HEIGHT, borderRadius: Radius.full },
});
