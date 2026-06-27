import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'default' | 'success' | 'danger';
type ToastItem = { id: number; message: string; variant: Variant };

type ToastContextValue = {
  /** Show a brief, self-dismissing confirmation. Replaces any toast already on screen. */
  show: (message: string, variant?: Variant) => void;
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

const ICONS: Record<Variant, ComponentProps<typeof MaterialIcons>['name']> = {
  default: 'info-outline',
  success: 'check-circle',
  danger: 'error-outline',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const idRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, variant: Variant = 'default') => {
    if (timer.current) clearTimeout(timer.current);
    const id = (idRef.current += 1);
    setToast({ id, message, variant });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), VISIBLE_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDismiss={dismiss} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const tint =
    toast.variant === 'success' ? theme.success : toast.variant === 'danger' ? theme.danger : theme.accent;

  return (
    <Animated.View
      pointerEvents="box-none"
      // Float just above the tab bar; respects the home-indicator inset.
      style={[styles.wrap, { bottom: insets.bottom + BottomTabInset + Spacing.two }]}>
      <Animated.View
        entering={FadeInDown.springify().damping(18).reduceMotion(ReduceMotion.System)}
        exiting={FadeOutDown.duration(160).reduceMotion(ReduceMotion.System)}
        style={styles.center}>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="alert"
          accessibilityLabel={toast.message}
          accessibilityLiveRegion="polite"
          style={[styles.toast, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
          <MaterialIcons name={ICONS[toast.variant]} size={20} color={tint} />
          <ThemedText type="small" style={styles.text} numberOfLines={2}>
            {toast.message}
          </ThemedText>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: Spacing.three },
  center: { width: '100%', maxWidth: MaxContentWidth },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    // A soft lift so it reads as floating above the content.
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { flex: 1 },
});
