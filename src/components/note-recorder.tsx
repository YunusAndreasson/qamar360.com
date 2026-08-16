import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { VoiceMeter } from '@/components/voice-meter';
import { Disabled, Radius, Spacing } from '@/constants/theme';
import { VOICE_MODEL_MB, type DictationState } from '@/hooks/use-dictation';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Props = Pick<DictationState, 'status' | 'progress' | 'error' | 'pending' | 'elapsed' | 'level'> & {
  onDownload: () => void;
  onStart: () => void;
  onStop: () => void;
  /** Ask the recogniser to load itself again, from the one state it cannot leave on its own. */
  onRetry: () => void;
};

/**
 * The bordered card the three not-yet-listening states sit in — the download ask, its progress, and
 * a failure. Written once, because it was written out three times.
 *
 * Deliberately not a `Surface`, close as the two are (`Radius.card`, a hairline border, a
 * `Spacing.three` inset). `Surface` also carries `Elevation.card` and the lit top edge, which say
 * "this is a card resting on the page" — and this is a panel *inside* the page's own column, on the
 * same plane as the writing above it. A shadow here would lift the instrument off the note.
 */
function Gate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.gate, { borderColor: theme.border }]}>{children}</View>;
}

/** mm:ss, because this one *is* a clock: it is counting up beside a live meter, which is the one
 *  place a duration reads as elapsed time rather than as a length. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The voice half of the note editor: a meter, a clock, and one button, on one line.
 *
 * Everything here is in service of a single question the user is always asking and can never answer
 * by looking at a microphone — *is it hearing me?* The meter answers it continuously, the sentences
 * landing in the field above answer it discretely, and the three states below are the ones where
 * the honest answer is "not yet", "no", or "still catching up" — each of which has to look
 * different from listening, or the app is lying by omission.
 *
 * **One line, and it is a budget.** This is a footer under a text field that has to hold a diary
 * entry, and every point spent here is a line the user can't see of what they wrote. Stacking the
 * meter, the button and the clock cost ~180pt — a third of a phone. Laid out as a row they cost ~80
 * and say exactly the same things: the button is still the one round live verb, the meter still
 * moves beside it, and the status still speaks under the meter rather than under the whole panel.
 */
export function NoteRecorder({
  status,
  progress,
  error,
  pending,
  elapsed,
  level,
  onDownload,
  onStart,
  onStop,
  onRetry,
}: Props) {
  const theme = useTheme();

  if (status === 'needsDownload') {
    return (
      <Gate>
        {/* The plainest true sentence about this feature, first — because the ask that follows is
            106 MB of somebody's data, and the only thing that justifies it is what it buys.
            "Qamar" and not `APP_NAME`: the product is Qamar360, the thing you talk to is Qamar, and
            the microphone error in `use-dictation` already uses the same short form. A version
            number in the middle of a sentence about trust reads like a legal notice. */}
        <ThemedText type="default">Qamar writes your notes down on this phone. Nothing is sent anywhere.</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          That needs a one-time {VOICE_MODEL_MB} MB download.
        </ThemedText>
        <AppButton onPress={onDownload} accessibilityLabel={`Download the voice model, ${VOICE_MODEL_MB} megabytes`}>
          Download
        </AppButton>
        {/* The escape hatch, and it is not a consolation prize: the field above is already open and
            already works. Nobody is ever blocked on this download, or on a microphone. */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          or just type — the field above is yours either way
        </ThemedText>
      </Gate>
    );
  }

  if (status === 'downloading') {
    const percent = Math.round(progress?.percent ?? 0);
    return (
      <Gate>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          {/* Naming the extract phase matters more than it looks: it runs at 100% of the download,
              so without it the bar sits full and still for several seconds and reads as a hang. */}
          {progress?.phase === 'extracting' ? 'Unpacking the voice model…' : `Downloading… ${percent}%`}
        </ThemedText>
        <View style={[styles.track, { backgroundColor: theme.controlTrack }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: theme.accent, width: `${progress?.phase === 'extracting' ? 100 : percent}%` },
            ]}
          />
        </View>
      </Gate>
    );
  }

  if (status === 'error') {
    return (
      <Gate>
        {/* Deliberately NOT `ErrorBanner`, which is the app's surface for a *transient* failure —
            it auto-clears after four seconds, and this one is a state the recogniser is sitting in
            until something changes it. A message that faded out would leave a card holding a retry
            for a problem it no longer names. So it stays put, and takes the danger tone rather than
            the muted one it used to wear, because a failure that reads like chrome reads as normal.
            The retry is the real repair: without it this state was terminal — `prepare()` ran once,
            in a mount effect, so the only way back to a microphone was to leave and come back. */}
        <ThemedText type="small" themeColor="danger" style={styles.centered}>
          {error}
        </ThemedText>
        <AppButton variant="secondary" onPress={onRetry} accessibilityLabel="Try the microphone again">
          Try again
        </AppButton>
        {/* The same escape hatch the download gate offers, for the same reason: nothing here has
            ever been allowed to stand between somebody and writing the day down. */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          or just type — the field above is yours either way
        </ThemedText>
      </Gate>
    );
  }

  const live = status === 'listening';
  const recording = live || status === 'arming';
  const busy = status === 'idle' || status === 'checking' || status === 'preparing';
  const finishing = status === 'finishing';

  return (
    // The rule is structural, not decorative: above it is the user's page, below it is the
    // instrument. Without it the bar floats in the same white space as the writing.
    <View style={[styles.panel, { borderTopColor: theme.border }]}>
      <PressableScale
        onPress={recording ? onStop : onStart}
        disabled={busy || finishing}
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Record your note'}
        accessibilityHint={
          recording ? 'Stops listening. Everything said so far stays in the field.' : 'Listens, and writes down what you say.'
        }
        style={[
          styles.button,
          { backgroundColor: recording ? theme.dangerSubtle : theme.accentSubtle },
          (busy || finishing) && { opacity: Disabled },
        ]}>
        <AppIcon name={recording ? 'stop' : 'mic'} size={24} color={recording ? theme.danger : theme.accent} />
      </PressableScale>
      {/* Meter over status, both hard left against the button — the two answers to "is it hearing
          me?" read as one readout that way, where a centred pair beside a left-hand button reads as
          two unrelated things drifting in the space left over. */}
      <View style={styles.readout}>
        <View style={styles.meterSlot}>
          <VoiceMeter level={level} live={live} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {statusLine({ status, elapsed, pending })}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * The one line under the meter.
 *
 * `arming` is the state this whole component exists to get right. The stream is open but no audio
 * has arrived, and saying "Listening…" here is how an app eats the first words of every note — the
 * user starts talking on the word, and the microphone isn't there yet. So it says nothing that
 * makes a claim, and the switch to "Listening" is driven by the first real audio buffer, with a
 * haptic, so nobody has to be watching the screen to know when to begin.
 */
function statusLine({ status, elapsed, pending }: Pick<DictationState, 'status' | 'elapsed' | 'pending'>): string {
  switch (status) {
    case 'checking':
      return 'Looking for the voice model…';
    case 'idle':
    case 'preparing':
      return 'Getting ready…';
    case 'arming':
      return 'Opening the microphone…';
    case 'listening':
      // The backlog is shown *while* listening too, not only at the end: on a slower phone the text
      // genuinely runs behind the voice, and a user who can see that it is behind will wait for it
      // instead of concluding the last thing they said was missed.
      return pending > 0 ? `${clock(elapsed)} · catching up…` : clock(elapsed);
    case 'finishing':
      return pending > 0 ? 'Writing down the last of it…' : 'Finishing…';
    default:
      return 'Tap to speak';
  }
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
    marginTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // A round, generous target: the one live verb on the screen, and the one that gets pressed in
  // the dark with a thumb. 56 rather than 64 now that it sits on a line beside the readout — still
  // well clear of the 44pt floor, and it sets the height of the whole footer.
  button: { width: 56, height: 56, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
  readout: { flex: 1, gap: Spacing.one },
  // The meter's own row centres its bars in whatever width it is given; this keeps it shrink-wrapped
  // so they sit above the first letter of the status line rather than out in the middle of the row.
  meterSlot: { alignItems: 'flex-start' },
  gate: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  centered: { textAlign: 'center' },
  track: { height: 4, borderRadius: Radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.full },
});
