import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { FadeInView } from '@/components/fade-in-view';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { BottomTabInset, Elevation, MaxContentWidth, Pressed, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Variant = 'success' | 'danger';
/** An optional trailing action (e.g. "Undo") — pressing it runs the handler and dismisses. */
type ToastAction = { label: string; onPress: () => void };
type ToastItem = { id: number; message: string; variant: Variant; action?: ToastAction };

type ToastContextValue = {
  /** Show a brief, self-dismissing confirmation. Replaces any toast already on screen. */
  show: (message: string, variant: Variant, action?: ToastAction) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/** Ephemeral feedback for actions whose result isn't otherwise visible on screen (e.g.
 *  "Progress reset") — a quiet, modern alternative to a blocking success `Alert`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

const VISIBLE_MS = 3200;
/** A toast carrying an action stays longer — the user needs time to decide, not just to read. */
const VISIBLE_ACTION_MS = 6000;

const ICONS: Record<Variant, IconName> = {
  success: 'success',
  danger: 'danger',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const idRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, variant: Variant, action?: ToastAction) => {
    if (timer.current) clearTimeout(timer.current);
    const id = (idRef.current += 1);
    setToast({ id, message, variant, action });
    timer.current = setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      action ? VISIBLE_ACTION_MS : VISIBLE_MS,
    );
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext value={{ show }}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDismiss={dismiss} /> : null}
    </ToastContext>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // `accessibilityLiveRegion` below is Android-only — without an explicit announcement iOS
  // VoiceOver never reads a toast at all (it appears unfocused and vanishes). Announce on iOS
  // only, so Android's live region doesn't speak everything twice.
  useEffect(() => {
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(toast.message);
  }, [toast.message]);

  // No green in the palette — a success ("done") toast wears the warm `complete` moonlight, the
  // same positive note the completion rings use; danger stays red.
  const tint = toast.variant === 'success' ? theme.complete : theme.danger;

  return (
    <View
      pointerEvents="box-none"
      // Float just above the tab bar; respects the home-indicator inset.
      style={[styles.wrap, { bottom: insets.bottom + BottomTabInset + Spacing.two }]}>
      <FadeInView style={styles.center}>
        {/* Two elements, never one nested inside the other. A `Pressable` is an accessibility
            element by default, and on iOS an accessible view COLLAPSES its descendants into
            itself — so while the whole toast was one pressable, the "Undo" inside it never
            received VoiceOver focus and the only way back from a commit was sighted-only.
            The plate is now an inert `View` and the two verbs sit side by side in it, the same
            construction the day's rows use for their floated `⋯`. */}
        <View style={[styles.toast, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
          {/* The message, and the dismiss. They are the same target on purpose — tapping the
              toast has always been how you wave it away — so this carries the words AND the
              action, and a screen reader gets one element that reads the message and dismisses
              on activation. (`alert` would be the truer role for the announcement, but a role
              that isn't activatable would hide the dismiss again, which is the whole bug. The
              announcement is carried by the live region on Android and by the explicit
              `announceForAccessibility` above on iOS, so nothing is lost by naming it a button.) */}
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={toast.message}
            accessibilityHint="Dismisses this message."
            accessibilityLiveRegion="polite"
            style={({ pressed }) => [styles.message, pressed && styles.messagePressed]}>
            <AppIcon name={ICONS[toast.variant]} size={20} color={tint} />
            <ThemedText type="small" style={styles.text} numberOfLines={2}>
              {toast.message}
            </ThemedText>
          </Pressable>
          {toast.action ? (
            <Pressable
              onPress={() => {
                // The action reverses a commit that just buzzed ("Undo") — the soft release
                // counter-texture, so un-committing is felt as clearly as committing was.
                haptics.undo();
                toast.action?.onPress();
                onDismiss();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={toast.action.label}
              accessibilityHint="Reverses what just happened."
              style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
              <ThemedText type="smallBold" themeColor="accent">
                {toast.action.label}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </FadeInView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.three },
  center: { width: '100%', maxWidth: MaxContentWidth },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    // Message group → action. With `styles.action`'s own paddingLeft this is the 16pt clearance
    // that comment promises; the group's internal glyph → text gap is `message`'s own.
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    // The shared card lift — the toast floats over content on the same recipe as raised cards.
    ...Elevation.card,
  },
  // The spoken group: the glyph and the words, which are one element to a screen reader and one
  // visual unit to the eye. `flex: 1` so it takes the toast's width and the action keeps its edge.
  // The message and the dismiss: the glyph and the words, as one target. `flex: 1` so it takes
  // the toast's width and the action keeps its edge.
  message: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  messagePressed: { opacity: Pressed.dim },
  text: { flex: 1 },
  // The trailing action ("Undo") — padded out so its target clears the text comfortably.
  // The width floor keeps Android from squeezing the label below its measured width (the same
  // flex-row measure/layout mismatch as `heading`'s trailing caption — the tail glyph wraps to
  // a clipped second line); `flex-end` keeps the label on the toast's right padding.
  action: { paddingLeft: Spacing.two, paddingVertical: Spacing.one, minWidth: 56, alignItems: 'flex-end' },
  actionPressed: { opacity: Pressed.dim },
});
