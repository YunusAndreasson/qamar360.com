import { useReducedMotion } from 'react-native-reanimated';

import { usePreference } from '@/lib/preferences';

/**
 * Whether the night sky may move — the tilt drift, the star twinkle, the occasional meteor.
 *
 * Two authorities, and the stricter always wins: the OS Reduce Motion setting can only silence
 * the sky, and the app's own "Sky motion" preference can only silence it further. Neither can
 * turn motion back on over the other, so a user who asked the system for a still interface
 * never gets a drifting one because of an app switch.
 *
 * Deliberately scoped to the *sky*. The rest of the app's motion — drag, the segmented thumb,
 * the celebration — keeps answering to Reduce Motion alone: those animations explain a state
 * change, while the sky's are pure atmosphere, and only atmosphere is worth a preference.
 */
export function useSkyMotion(): boolean {
  const allowed = usePreference('skyMotion');
  const reduceMotion = useReducedMotion();
  return allowed && !reduceMotion;
}
