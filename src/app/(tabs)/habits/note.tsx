import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { NoteRecorder } from '@/components/note-recorder';
import { useAuth } from '@/hooks/use-auth';
import { useDictation } from '@/hooks/use-dictation';
import { useHabits } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useNotes } from '@/hooks/use-notes';
import { confirmDestructive } from '@/lib/alerts';
import { addDaysISO } from '@/lib/dates';
import { stitchSpoken, tidyDictation } from '@/lib/note-tidy';
import { applyVocabulary } from '@/lib/note-vocabulary';
import { appendToBody } from '@/lib/notes';
import { clearNoteDraft, readNoteDraft, writeNoteDraft } from '@/lib/notes-cache';

/**
 * Writing the day's note — the one screen where the app holds words the user actually chose.
 *
 * A full-screen modal rather than a form sheet, for the same reason the habit editor is one: this
 * has a focused text field and a keyboard, and a `fitToContents` sheet can hold neither comfortably.
 * It also wants the room — a diary entry that has to be composed in a letterbox is one that gets
 * written shorter than it was meant to be.
 *
 * **One object, two ways in.** The field is a plain editable text area from the first frame, and
 * the microphone appends to it. Speaking is not a mode you enter and leave — it is how you write,
 * and typing is the equal path for anyone whose accent the model fumbles, anyone in a room where
 * speaking aloud isn't on, and anyone who simply prefers it. Neither the download nor the
 * microphone can ever block the note being written.
 */
export default function NoteScreen() {
  const router = useRouter();
  const { viewDate, today } = useHabits();
  const { noteFor, saveNote, vocabulary } = useNotes();

  // The day being written about. Today's foot opens this with no parameter and means the viewed
  // day; the Journal opens it with one, and that day may be years old — far outside the stepper's
  // thirty-day reach, which is exactly why the day travels as a parameter rather than by moving
  // the whole screen behind it.
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const day = dayParam ?? viewDate;
  const note = noteFor(day);

  // From the session, not from the note row — a note being written for the first time has no row
  // to read an owner off, and that is precisely the case where losing the draft would hurt most.
  const userId = useAuth().user?.id ?? null;

  const saved = note?.body ?? '';
  // Seeded from the last interrupted sitting when there is one for this day and it holds more than
  // the server does. A draft only exists when the app went away mid-note, so preferring it is
  // preferring the more recent truth — the same rule as the composer that keeps what you typed
  // when the keyboard is dismissed mid-thought.
  const [body, setBody] = useState(() => {
    const draft = readNoteDraft();
    const mine = draft && draft.userId === userId && draft.day === day;
    return mine && draft.body.trim().length > saved.trim().length ? draft.body : saved;
  });
  // Mirrored through `useLatestRef` (an effect, not a render-time write) and additionally written
  // by hand inside `onSentence` — because two sentences can land from the decode queue before React
  // re-renders, and the second must append to the first rather than to what was on screen.
  const bodyRef = useLatestRef(body);

  const [spokenSeconds, setSpokenSeconds] = useState(note?.spoken_seconds ?? 0);

  // True until the first sentence of a recording lands. A new sitting opens a new paragraph; the
  // sentences within it are joined by a space, because those are breaths, not sittings.
  const freshSitting = useRef(true);

  /**
   * A sentence, back from the recogniser.
   *
   * Three things happen here and their order is load-bearing.
   *
   * {@link tidyDictation} first, on the raw output and only ever on the raw output — a filler
   * sitting inside a phrase ("in um shāʾ Allāh") would otherwise stop the next step from seeing the
   * phrase at all. {@link applyVocabulary} second, putting it into the app's own spelling ("dua"
   * becomes `duʿāʾ`). {@link stitchSpoken} last, because deciding whether this is a new sentence or
   * the rest of the previous one means reading the tail of a body that has already been corrected.
   *
   * Then the result is written to the local draft *immediately*. The audio it came from has already
   * been dropped, so this write is the only copy of the sentence until the note is saved.
   */
  const onSentence = useCallback(
    (text: string) => {
      // TEMPORARY, and it has a job to finish: nobody has yet compared a real transcript against
      // what was actually said, so the rules above are tuned against synthetic fixtures and a
      // prediction about how Moonshine punctuates an isolated segment. Speak a few notes with this
      // in, read them back out of logcat, and freeze them as fixtures — then delete these two lines.
      // `warn` rather than `log` because it is the level this project permits, and because a
      // diagnostic that is meant to be removed should be loud enough to find.
      if (__DEV__) console.warn('[note] raw segment:', JSON.stringify(text));
      const spoken = applyVocabulary(tidyDictation(text), vocabulary);
      // A segment that was nothing but "um" is nothing said. Returning here rather than appending an
      // empty string also keeps `freshSitting` true, so the first real sentence still opens its own
      // paragraph instead of being stitched onto the last sitting.
      if (!spoken) return;
      const next = freshSitting.current
        ? appendToBody(bodyRef.current, spoken)
        : stitchSpoken(bodyRef.current, spoken, vocabulary);
      freshSitting.current = false;
      bodyRef.current = next;
      setBody(next);
      if (userId) writeNoteDraft({ userId, day, body: next });
    },
    [vocabulary, userId, day, bodyRef],
  );

  const dictation = useDictation(onSentence);
  const { prepare, start, stop, status, elapsed } = dictation;

  // Load and warm the recogniser while the user is still reading the screen, so the tap on the
  // microphone is instant. The first decode builds the ONNX graph and costs ~3 s; paying that here
  // rather than after the tap is the difference between a control that responds and one that hangs.
  useEffect(() => {
    void prepare();
  }, [prepare]);

  const recording = status === 'arming' || status === 'listening';

  const beginRecording = useCallback(() => {
    freshSitting.current = true;
    void start();
  }, [start]);

  const endRecording = useCallback(async () => {
    const seconds = elapsed;
    await stop();
    setSpokenSeconds((prev) => prev + seconds);
  }, [elapsed, stop]);

  const save = useCallback(async () => {
    // Tapping Save while still speaking means "I'm done" — so it stops, waits for the last
    // sentence to be written down, and then saves. A Save that did nothing until you had first
    // found the Stop button would be a dead control at the exact moment of finishing.
    let seconds = spokenSeconds;
    let text = body;
    if (recording) {
      seconds += elapsed;
      await stop();
      // Read *after* the queue has drained: `stop()` waits for the last sentences, and each of
      // them appended to the ref. `body` here is still whatever it was when this closure was made.
      text = bodyRef.current;
    }
    await saveNote(text, seconds > 0 ? seconds : null, day);
    router.back();
  }, [recording, elapsed, spokenSeconds, body, bodyRef, stop, saveNote, day, router]);

  const cancel = useCallback(() => {
    const leave = () => {
      clearNoteDraft();
      router.back();
    };
    if (body.trim() === saved.trim()) {
      leave();
      return;
    }
    // The one confirm on this screen, and it earns its interruption: everything else here is
    // recoverable, and this is the single action that can lose words somebody spoke aloud.
    confirmDestructive({
      title: 'Discard this note?',
      message: 'What you have written will not be kept.',
      confirmLabel: 'Discard',
      onConfirm: () => {
        if (recording) void stop();
        leave();
      },
    });
  }, [body, saved, recording, stop, router]);

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: noteTitle(day, today),
          headerTitleAlign: 'center',
          // `save` reads `bodyRef` only after awaiting the decode queue — inside an event handler,
          // never during render. The rule can't see past the await, so it treats any function that
          // touches a ref as one being read here.
          // eslint-disable-next-line react-hooks/refs -- read is post-await, in a handler
          ...formHeaderActions({
            onCancel: cancel,
            onSave: () => void save(),
            // Saving an unchanged note is a no-op, and saving an empty one deletes the row — which
            // is a real action worth allowing, so "emptied" counts as a change.
            canSave: body.trim() !== saved.trim(),
          }),
        }}
      />

      <FormField
        value={body}
        onChangeText={setBody}
        multiline
        // Never autofocused. The keyboard covering the microphone the moment this opens would put
        // the typed path in front of the spoken one on a screen that is voice-first by design.
        placeholder="However the day went."
        autoCapitalize="sentences"
        accessibilityLabel="Your note"
        style={styles.field}
      />

      <NoteRecorder
        status={dictation.status}
        progress={dictation.progress}
        error={dictation.error}
        pending={dictation.pending}
        elapsed={dictation.elapsed}
        level={dictation.level}
        onDownload={() => void dictation.download()}
        onStart={beginRecording}
        onStop={() => void endRecording()}
      />
    </FormScreen>
  );
}

/** The modal's title names the day it is writing about — so a note started from a step back to
 *  Tuesday can never be mistaken for tonight's. */
function noteTitle(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDaysISO(today, -1)) return 'Yesterday';
  return new Date(day + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

const styles = StyleSheet.create({
  // Tall enough to invite a paragraph rather than a line, and top-aligned so the first sentence
  // starts at the top of the box instead of floating in the middle of it. Deliberately no
  // `lineHeight`: an explicit one on an iOS TextInput clips the glyph box, and this is the one
  // field in the app most likely to contain ā, ḥ, ṣ and ʿ (see FormField).
  field: { minHeight: 200, textAlignVertical: 'top' },
});
