import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Whether the app is in the foreground.
 *
 * `inactive` counts as "no" alongside `background`: iOS reports it for the app switcher, Control
 * Centre, and system prompts — moments where nothing we animate can be read, but where a running
 * animation still holds the display link open at the device's full refresh rate.
 */
export function useAppForeground(): boolean {
  const [foreground, setForeground] = useState(() => AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  return foreground;
}

/**
 * Whether this screen is the one actually being looked at: focused in its navigator *and* the app
 * in the foreground.
 *
 * The app's ambient animations — the sky's tilt drift and star twinkle, the Progress moon's breath
 * — have no end condition, and Reanimated has no notion of visibility: an animation on a screen
 * that has been scrolled off, switched away from, or backgrounded goes on evaluating and writing
 * view properties every frame. Under `NativeTabs` every tab is mounted eagerly and never
 * unmounts, so without this gate the app pays for three skies' worth of per-frame work from
 * launch while only ever showing one. Gate every never-ending animation on it.
 *
 * Starts `false` and is raised by the first focus, because a screen that has never been focused
 * never runs `useFocusEffect` at all — the eagerly-mounted tabs you have not visited.
 */
export function useOnStage(): boolean {
  const foreground = useAppForeground();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused && foreground;
}
