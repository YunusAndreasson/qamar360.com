import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Scale, Spring } from '@/constants/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Scale target while pressed. Defaults to `Scale.press`; pass `Scale.glyph` for bare icons. */
  scaleTo?: number;
};

/**
 * A Pressable that gives the app's standard tactile press feedback: a subtle
 * scale-down that springs back on release. Android ripple and all other Pressable
 * props pass straight through; honours the system "Reduce Motion" setting.
 *
 * Use for discrete controls (buttons, icon glyphs, cards, segments). Full-bleed
 * list rows that live inside a Swipeable/draggable keep a background highlight
 * instead — a scale transform there would fight the gesture translate.
 */
export function PressableScale({
  style,
  scaleTo = Scale.press,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: Props) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  // Reanimated 4's `.get()`/`.set()` accessors (not the legacy `.value` property) — a method
  // call rather than a mutation, so the React Compiler's immutability rule stays satisfied.
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => {
        if (!reduceMotion && !disabled) scale.set(withSpring(scaleTo, Spring.press));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduceMotion) scale.set(withSpring(1, Spring.press));
        onPressOut?.(e);
      }}
      style={[animatedStyle, style]}
      {...props}
    />
  );
}
