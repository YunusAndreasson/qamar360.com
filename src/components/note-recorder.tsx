import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { VoiceMeter } from '@/components/voice-meter';
import { Radius, Spacing } from '@/constants/theme';
import { VOICE_MODEL_MB, type DictationState } from '@/hooks/use-dictation';
import { useTheme } from '@/hooks/use-theme';

type Props = Pick<DictationState, 'status' | 'progress' | 'error' | 'pending' | 'elapsed' | 'level'> & {
  onDownload: () => void;
  onStart: () => void;
  onStop: () => void;
};

/** mm:ss, because this one *is* a clock: it is counting up beside a live meter, which is the one
 *  place a duration reads as elapsed time rather than as a length. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * The voice half of the note editor: a meter, a clock, and one button.
 *
 * Everything here is in service of a single question the user is always asking and can never answer
 * by looking at a microphone — *is it hearing me?* The meter answers it continuously, the sentences
 * landing in the field above answer it discretely, and the three states below are the ones where
 * the honest answer is "not yet", "no", or "still catching up" — each of which has to look
 * different from listening, or the app is lying by omission.
 */
export function NoteRecorder({ status, progress, error, pending, elapsed, level, onDownload, onStart, onStop }: Props) {
  const theme = useTheme();

  if (status === 'needsDownload') {
    return (
      <View style={[styles.gate, { borderColor: theme.border }]}>
        {/* The plainest true sentence about this feature, first — because the ask that follows is
            106 MB of somebody's data, and the only thing that justifies it is what it buys. */}
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
      </View>
    );
  }

  if (status === 'downloading') {
    const percent = Math.round(progress?.percent ?? 0);
    return (
      <View style={[styles.gate, { borderColor: theme.border }]}>
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
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={[styles.gate, { borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
          {error}
        </ThemedText>
      </View>
    );
  }

  const live = status === 'listening';
  const recording = live || status === 'arming';
  const busy = status === 'idle' || status === 'checking' || status === 'preparing';
  const finishing = status === 'finishing';

  return (
    <View style={styles.panel}>
      <VoiceMeter level={level} live={live} />
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
          (busy || finishing) && { opacity: 0.5 },
        ]}>
        <AppIcon name={recording ? 'stop' : 'mic'} size={26} color={recording ? theme.danger : theme.accent} />
      </PressableScale>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {statusLine({ status, elapsed, pending })}
      </ThemedText>
    </View>
  );
}

/**
 * The one line under the button.
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
  panel: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  // A round, generous target: the one live verb on the screen, and the one that gets pressed in
  // the dark with a thumb.
  button: { width: 64, height: 64, borderRadius: Radius.full, alignItems: 'center', justifyContent: 'center' },
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
