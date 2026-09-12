import { NativeModule, requireOptionalNativeModule } from 'expo';

type ContinuedWorkEvents = {
  onStop(event: { reason: string }): void;
};

declare class ContinuedWorkModule extends NativeModule<ContinuedWorkEvents> {
  isSupported(): boolean;
  begin(title: string, subtitle: string): Promise<void>;
  update(title: string, subtitle: string, completed: number, total: number): void;
  end(success: boolean): void;
}

// Progress goes to the system in thousandths, so a slow stretch still registers as movement.
const UNITS = 1000;

export type ContinuedWork = {
  /** Shows how far along the work is. Repeats of what is already shown never reach the system. */
  update(subtitle: string, fraction: number): void;
  end(success: boolean): void;
};

/**
 * Starts work the system keeps running if the app is backgrounded: a Live Activity on iOS 26 and
 * newer, a foreground-service notification on Android. Resolves null where that isn't available,
 * including binaries built before the native module existed, and the caller keeps the work in the
 * foreground. `onStop` fires when the person cancels from outside the app or the system ends it,
 * with `cancelled` (an Android notification's Cancel) or `expired` (iOS cannot tell a person
 * cancelling from the Live Activity apart from the system ending the task).
 */
export async function beginContinuedWork(
  title: string,
  subtitle: string,
  onStop: (reason: string) => void,
): Promise<ContinuedWork | null> {
  const native = requireOptionalNativeModule<ContinuedWorkModule>('ContinuedWork');
  if (!native?.isSupported()) return null;
  let ended = false;
  const subscription = native.addListener('onStop', ({ reason }) => {
    if (ended) return;
    ended = true;
    subscription.remove();
    onStop(reason);
  });
  try {
    await native.begin(title, subtitle);
  } catch {
    ended = true;
    subscription.remove();
    return null;
  }
  let shown = '';
  return {
    update(nextSubtitle, fraction) {
      const completed = Math.round(Math.min(Math.max(fraction, 0), 1) * UNITS);
      const key = `${nextSubtitle}|${completed}`;
      if (ended || key === shown) return;
      shown = key;
      native.update(title, nextSubtitle, completed, UNITS);
    },
    end(success) {
      if (ended) return;
      ended = true;
      subscription.remove();
      native.end(success);
    },
  };
}
