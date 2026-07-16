import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { FadeInView } from '@/components/fade-in-view';
import { MoonPhase } from '@/components/moon-phase';
import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { HeroGlow } from '@/components/ornament/hero-glow';
import { ThemedText } from '@/components/themed-text';
import { Duration, Scale, Tick } from '@/constants/motion';
import { Elevation, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { loadProgress, type MonthProgress } from '@/hooks/use-progress';
import { useTallyUp } from '@/hooks/use-tally-up';
import { useTheme } from '@/hooks/use-theme';
import { celebrationCopy } from '@/lib/celebration';
import { hijriMonthRange, hijriParts } from '@/lib/dates';
import { moonIllumination } from '@/lib/moon';

/**
 * The day-complete celebration — a subtle, self-dismissing moonlit moment shown when the last
 * scheduled habit of the (live) day is ticked. Reframes the moment as gratitude ("Alḥamdulillāh")
 * over self-congratulation, grounds it in the Hijri date, and gives calm progress feedback (degrees
 * this month, days left, pace vs last month). The visual rides the same `Tick` clock the celebrate
 * haptic already fires on (the haptic itself lives in `use-habits`, so we never double-buzz here).
 *
 * Mounted at the root like {@link ToastProvider} — an overlay above the navigator, inside Auth so it
 * can fetch progress. `HabitsProvider` (a descendant) calls `useDayComplete().celebrate(day)`.
 */
/** `doneToday` are the ids the completion seam already proved done for `day` (the overlay only fires
 *  once the day is complete) — passed so the overlay's degrees count the just-made ticks even before
 *  they reach the server, keeping it in step with the Progress tab. */
type DayCompleteContextValue = { celebrate: (day: string, doneToday: string[]) => void };
const NOOP: DayCompleteContextValue = { celebrate: () => {} };
const DayCompleteContext = createContext<DayCompleteContextValue>(NOOP);

/** Tolerant by design: returns a no-op when no provider is mounted, so a consumer — even another
 *  provider like `HabitsProvider` — never crashes if the overlay isn't in the tree (tests, misconfig). */
export function useDayComplete(): DayCompleteContextValue {
  return useContext(DayCompleteContext);
}

/** How long the celebration lingers before it fades itself out. Long enough to read, short enough
 *  to stay "put the phone down" subtle. Tap anywhere to dismiss sooner. */
const VISIBLE_MS = 5200;
const MOON_SIZE = 96;
const GLOW_SIZE = 184;
// A firmer modal scrim than the old 0.5: at 0.5 the app behind stayed clearly legible, so the
// card — a near-black elevated surface on a near-black theme — didn't announce itself (you could
// miss the moment). `theme.scrim` (0.7) recedes the app so the lit card + moon read as a distinct
// foreground layer (still short of an opaque blackout — the night sky behind stays sensed, not
// erased). Applied inline from the theme, where the value is shared with any future overlay.

export function DayCompleteProvider({ children }: { children: ReactNode }) {
  const [celebration, setCelebration] = useState<{ id: number; day: string; doneToday: string[] } | null>(null);
  const idRef = useRef(0);
  // Celebrate a given day at most once per session — un-tick then re-tick must not nag.
  const lastDay = useRef<string | null>(null);

  const celebrate = useCallback((day: string, doneToday: string[]) => {
    if (lastDay.current === day) return;
    lastDay.current = day;
    setCelebration({ id: (idRef.current += 1), day, doneToday });
  }, []);

  const dismiss = useCallback(() => setCelebration(null), []);

  return (
    <DayCompleteContext value={{ celebrate }}>
      {children}
      {celebration ? (
        <DayCompleteOverlay key={celebration.id} day={celebration.day} doneToday={celebration.doneToday} onDismiss={dismiss} />
      ) : null}
    </DayCompleteContext>
  );
}

function DayCompleteOverlay({ day, doneToday, onDismiss }: { day: string; doneToday: string[]; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { user } = useAuth();

  // The moon shows the day's true phase — computed straight from the Hijri date, so it's on screen
  // instantly (no fetch): the "moon turns on" beat needs no network.
  const parts = hijriParts(day);
  const monthLength = hijriMonthRange(day)?.length ?? 30;
  const { illumination, waxing } = moonIllumination(parts?.day ?? 15, monthLength);

  // Stats: a one-shot progress read (the overlay lives outside the navigator, so it can't use the
  // focus-driven useProgress hook). Gratitude + Hijri render immediately; stats fade in when ready.
  const [month, setMonth] = useState<MonthProgress | null>(null);
  // No user → nothing to fetch, so the stats are "ready" immediately. Seeded here rather than
  // set from the effect (a synchronous setState-in-effect); the effect only runs the fetch.
  const [statsReady, setStatsReady] = useState(!user?.id);
  useEffect(() => {
    if (!user?.id) return; // nothing to fetch — statsReady already true
    let active = true;
    void loadProgress(user.id, day, doneToday)
      .then((d) => {
        if (!active) return;
        setMonth(d.month);
        setStatsReady(true);
      })
      .catch(() => {
        if (active) setStatsReady(true);
      });
    return () => {
      active = false;
    };
    // doneToday is fixed for a given celebration (set once when it fires), so it never re-triggers.
  }, [user?.id, day, doneToday]);

  const copy = celebrationCopy(month, day);

  // `enter` blooms the scrim + card in (t=0). `beat` lands the glow bloom at t=Tick.sweep — the same
  // moment the celebrate haptic's Heavy tail fires, so the moon "lights up" on the buzz. `exit`
  // fades everything out on dismiss (the Toast has no exit anim to borrow — this is hand-built).
  const enter = useSharedValue(reduceMotion ? 1 : 0);
  const beat = useSharedValue(reduceMotion ? 1 : 0);
  const exit = useSharedValue(1);
  // The moon steps to full brightness on the beat; the smooth glow bloom masks the step.
  const [lit, setLit] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;
    enter.set(withTiming(1, { duration: Duration.base, easing: Easing.out(Easing.quad) }));
    beat.set(withDelay(Tick.sweep, withTiming(1, { duration: Tick.settle, easing: Easing.out(Easing.quad) })));
    const t = setTimeout(() => setLit(true), Tick.sweep);
    return () => clearTimeout(t);
  }, [reduceMotion, enter, beat]);

  const dismissing = useRef(false);
  const runDismiss = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    if (reduceMotion) {
      onDismiss();
      return;
    }
    exit.set(
      withTiming(0, { duration: Duration.base }, (finished) => {
        if (finished === true) scheduleOnRN(onDismiss);
      }),
    );
  }, [reduceMotion, exit, onDismiss]);

  useEffect(() => {
    const t = setTimeout(runDismiss, VISIBLE_MS);
    return () => clearTimeout(t);
  }, [runDismiss]);

  // Opacity rides ONLY the dismiss value (`exit`), never the entrance `enter`: the overlay must be
  // fully opaque the instant it mounts. Gating base visibility on a mount fade meant that if that
  // fade ever failed to run to 1 (a Reanimated/Fabric hiccup on this root-level overlay), the whole
  // celebration stayed translucent — "dimmed, you almost miss it". `enter` still drives the scale
  // pop and the glow beat, so the entrance keeps its life without holding visibility hostage.
  const scrimStyle = useAnimatedStyle(() => ({ opacity: exit.get() }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: exit.get(),
    transform: [{ scale: Scale.enter + (1 - Scale.enter) * enter.get() }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: beat.get() }));

  return (
    <Pressable
      onPress={runDismiss}
      accessibilityRole="alert"
      accessibilityViewIsModal
      accessibilityLabel={`Day complete. Alḥamdulillāh.${copy.hijriLabel ? ` ${copy.hijriLabel}.` : ''}`}
      style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* absoluteFill, NOT styles.fill — the latter carries `zIndex: 200` (needed on the Pressable to
          sit above the navigator), which on the scrim painted it OVER the card, veiling the whole
          celebration in 70% black. The scrim must sit BEHIND the card: no zIndex, so document order
          (scrim first, card second) puts the card on top. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, scrimStyle]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.card,
          // An ELEVATED surface (not the flat element fill): on dark this is a lifted panel that
          // clears the scrim, on light it stays white. With the firmer scrim it reads as a distinct
          // card, not a faint wash — the "better balance" between subtle and legible.
          { backgroundColor: theme.backgroundElevated, borderColor: theme.controlTrack },
          Elevation.card,
          cardStyle,
        ]}
        pointerEvents="none">
        <View style={styles.backdropClip} pointerEvents="none">
          <GeometricBackdrop variant="hero" />
        </View>

        <View style={styles.moon}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.center, glowStyle]} pointerEvents="none">
            <HeroGlow size={GLOW_SIZE} />
          </Animated.View>
          <MoonPhase illumination={illumination} waxing={waxing} size={MOON_SIZE} brightness={lit ? 1 : 0.8} />
        </View>

        <ThemedText type="subtitle" themeColor="complete" style={styles.headline}>
          Alḥamdulillāh
        </ThemedText>
        {copy.hijriLabel ? (
          <ThemedText type="small" themeColor="textSecondary">
            {copy.hijriLabel}
          </ThemedText>
        ) : null}

        {statsReady && copy.degrees != null ? (
          <FadeInView delay={Duration.base} style={styles.stats}>
            <DegreesReadout target={copy.degrees} />
            {copy.daysLeftLabel ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.paceText}>
                {copy.daysLeftLabel}
                {copy.paceLabel ? ` · ${copy.paceLabel}` : ''}
              </ThemedText>
            ) : null}
          </FadeInView>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/**
 * The big "247°" readout, isolated so its count-up re-renders only this text — the moon/backdrop SVG
 * siblings stay still. The stats block only appears once the fetch resolves — already after the
 * beat — so the {@link useTallyUp} ramp starts on mount (the fade-in reveals it) rather than
 * sitting at 0; Reduce Motion shows the final number at once (the hook gates itself).
 */
function DegreesReadout({ target }: { target: number }) {
  const shown = useTallyUp(target, Duration.tally);

  return (
    <View style={styles.center}>
      <ThemedText type="display" themeColor="complete" style={styles.degrees}>
        {shown}°
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        this month
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '86%',
    maxWidth: 360,
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.overlay,
    borderWidth: 1,
    overflow: 'visible',
    zIndex: 1, // above the scrim (which now has no zIndex) — the card must never sit behind the veil
  },
  // Clips the seed-of-life ground to the card's rounded corners without clipping the card's shadow.
  backdropClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: Radius.overlay, overflow: 'hidden' },
  moon: { width: MOON_SIZE, height: MOON_SIZE, alignItems: 'center', justifyContent: 'center' },
  headline: { textAlign: 'center' },
  stats: { alignItems: 'center', gap: Spacing.one },
  degrees: { textAlign: 'center' },
  paceText: { textAlign: 'center' },
});
