import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, StyleSheet, View, type TextInput } from 'react-native';

import { ErrorBanner } from '@/components/error-banner';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { HeaderIconButton } from '@/components/header-icon-button';
import { NoteRecorder } from '@/components/note-recorder';
import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { Icons } from '@/constants/icons';
import { BottomTabInset, Face, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useDictation } from '@/hooks/use-dictation';
import { useHabits } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { useNotes } from '@/hooks/use-notes';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import { stitchSpoken, tidyDictation } from '@/lib/note-tidy';
import { applyVocabulary } from '@/lib/note-vocabulary';
import { appendToBody, noteDateTitle } from '@/lib/notes';
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
 *
 * **The field is the screen.** Not a scroll view holding a 200pt box with a panel under it — a
 * column, in which the note takes every point the recorder and the keyboard don't. A diary field
 * that shows six lines teaches you to write six lines, and the words go where the room is.
 */
export default function NoteScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { viewDate, today } = useHabits();
  const { noteFor, saveNote, vocabulary, error, dismissError } = useNotes();

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

  const fieldRef = useRef<TextInput>(null);
  /**
   * The caret, pinned to the end of the note as each sentence lands.
   *
   * This is what makes "it goes in the field" true rather than merely intended: a focused input
   * scrolls to keep its caret visible, so pinning the caret to the end is what drags each new
   * sentence into view instead of letting the note grow off the bottom of a box the user is
   * staring at the top of. Only ever *applied* while a sitting is open (see the field below) — a
   * permanently controlled selection would fight anyone trying to put the cursor somewhere and
   * type.
   */
  const [caret, setCaret] = useState<{ start: number; end: number } | undefined>(undefined);

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
      setCaret({ start: next.length, end: next.length });
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
  /**
   * A sitting — open from the moment the recogniser takes the microphone until the last sentence
   * has been written down. Read off the recogniser's own status rather than mirrored in state, so
   * that every way a sitting can end closes it: Stop, the ten-minute ceiling that stops capture
   * from inside the hook, and a microphone that never delivers a buffer.
   *
   * `finishing` counts as open on purpose. `stop()` resolves only once the queue has drained, and
   * those last sentences still have to land in a focused field with a pinned caret.
   */
  const speaking = recording || status === 'finishing';

  /**
   * Tapping the microphone points the note at your voice — and says so in the one place that can
   * be believed, which is the field itself.
   *
   * The keyboard goes down (it was covering the half of the note that is about to be written), the
   * caret moves to where the words will appear, and a beat later — when the microphone is actually
   * open — the field takes focus and its rule lights. Nothing about "dictation" is a mode with its
   * own destination: from here until Stop, what you say is what is in the note.
   */
  const beginRecording = useCallback(() => {
    freshSitting.current = true;
    Keyboard.dismiss();
    setCaret({ start: body.length, end: body.length });
    // Bank the previous sitting before `start()` zeroes the clock — this is the last moment its
    // seconds are worth anything, and it is the only accounting a sitting needs: the one still to
    // come is read live off `elapsed` when the note is saved.
    setSpokenSeconds((prev) => prev + elapsed);
    void start();
  }, [start, body, elapsed]);

  /**
   * The field takes focus for as long as the sitting lasts, and gives it back after.
   *
   * Focus is what makes the caret real — and a real caret is what scrolls the note as it grows.
   * It happens here rather than in the tap handler because `showSoftInputOnFocus` has to be false
   * on the native view *before* it takes focus, and an effect is the only thing that runs late
   * enough to guarantee the commit landed first. On the way out it blurs: a blinking caret you
   * can't type into is the one state worse than no caret at all.
   */
  useEffect(() => {
    if (speaking) fieldRef.current?.focus();
    else fieldRef.current?.blur();
  }, [speaking]);

  const save = useCallback(async () => {
    // Tapping Save while still speaking means "I'm done" — so it stops, waits for the last
    // sentence to be written down, and then saves. A Save that did nothing until you had first
    // found the Stop button would be a dead control at the exact moment of finishing.
    let text = body;
    if (recording) {
      await stop();
      // Read *after* the queue has drained: `stop()` waits for the last sentences, and each of
      // them appended to the ref. `body` here is still whatever it was when this closure was made.
      text = bodyRef.current;
    }
    // Everything banked by earlier sittings, plus the clock of the one just finished — `elapsed`
    // holds its final value until the next `start()`, so this is right whether the sitting ended
    // on Stop, on the ten-minute ceiling, or on this Save.
    const seconds = spokenSeconds + elapsed;
    // Only on the way out. A modal that dismisses on a failed write takes with it both the one
    // surface the error could appear on and — as far as anyone watching can tell — the words: the
    // optimistic row is rolled back, so the day goes quietly blank. Staying is also what makes the
    // conflict message true, since it talks about text "still in the editor".
    if (await saveNote(text, seconds > 0 ? seconds : null, day)) router.back();
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
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Same lunar sky the editors carry, painted behind the column rather than inside a scroll
          view — this screen doesn't scroll, the field inside it does. */}
      <GeometricBackdrop variant="screen" />
      <Stack.Screen
        options={{
          // The same name the row that opened this gives the day — `noteDateTitle`, not a title of
          // its own. A note started by stepping back to Tuesday can never be mistaken for tonight's,
          // and one opened from a five-year-old Journal row keeps the year that found it.
          title: noteDateTitle(day, today),
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
            // Only for a day that has something saved to throw away: on a blank one Cancel already
            // does everything this could. `⋯` rather than a trash glyph, per the app's own rule —
            // it says "things you can do to this", which is a safer thing to put beside Save than
            // a destructive verb one slip away from it.
            extra: saved ? (
              <HeaderIconButton
                icon={Icons.ellipsis}
                color={theme.textSecondary}
                accessibilityLabel="Note options"
                onPress={() => router.push({ pathname: '/habits/note-actions', params: { day } })}
              />
            ) : null,
          }),
        }}
      />

      {/* `padding` on iOS, nothing on Android — the activity is `adjustResize`, so the column is
          already handed a shorter screen when the keyboard opens and the field simply flexes into
          what is left. Doubling that with a KAV would subtract the keyboard twice. */}
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* The gutter lives on this inner view, not on the KAV: `behavior="padding"` composes its
            own `paddingBottom` over whatever style it is given — zero while the keyboard is down —
            so a bottom inset written there is silently thrown away. */}
        <View style={styles.column}>
          {/* Above the page, because a save that failed is the one thing here more urgent than the
              writing — and because until now there was nowhere at all to read a note error. No
              style of its own: the column already carries the gutter, and the banner brings its own
              bottom margin. The page below is `flex: 1`, so it lends the banner its height and
              takes it back on dismiss. */}
          <ErrorBanner message={error} onDismiss={dismissError} />

          {/* The margin rule — the one piece of structure on the page, and the only thing on this
              screen that changes appearance when a sitting opens.

              It is a rule in the notebook sense: it marks where the writing column begins, it is
              there whether or not anyone is speaking (so no text ever reflows around it), and it
              lights in `accent` — the app's one colour for *live* — while the microphone is
              feeding the field. That is the whole answer to "where do my words go": the column
              they go into is the column that lit up. */}
          <View style={styles.page}>
            <View style={[styles.rule, { backgroundColor: speaking ? theme.accent : theme.border }]} />
            <FormField
              ref={fieldRef}
              value={body}
              // Only a *typed* change reaches here — a programmatic `setBody` doesn't — so this is
              // the exact moment to hand the caret back: the user has taken the note somewhere the
              // pinned end-of-text selection has no business dragging them away from.
              onChangeText={(text) => {
                setBody(text);
                setCaret(undefined);
              }}
              // Applied only while a sitting is open: outside one the caret belongs to whoever is
              // holding the phone, and a controlled selection would keep snapping it back.
              selection={speaking ? caret : undefined}
              // Suppressed only while a sitting is open, so the focus below can light the field
              // without the keyboard coming with it. True again the moment it closes, or the field
              // would be permanently untypable.
              showSoftInputOnFocus={!speaking}
              multiline
              // Never autofocused. The keyboard covering the microphone the moment this opens would
              // put the typed path in front of the spoken one on a voice-first screen.
              placeholder={speaking ? 'What you say lands here.' : 'However the day went.'}
              autoCapitalize="sentences"
              // Both platforms otherwise draw the caret in their own accent (system blue, or
              // whatever the Android theme carries) — off-palette, on the one screen in the app
              // where a caret sits visible for minutes at a time.
              selectionColor={theme.accent}
              accessibilityLabel="Your note"
              style={styles.field}
            />
          </View>

          <NoteRecorder
            status={dictation.status}
            progress={dictation.progress}
            error={dictation.error}
            pending={dictation.pending}
            elapsed={dictation.elapsed}
            level={dictation.level}
            onDownload={() => void dictation.download()}
            onRetry={() => void dictation.retry()}
            onStart={beginRecording}
            onStop={() => void stop()}
          />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // The same gutter every modal form keeps (`formContentStyle`), reproduced rather than inherited:
  // this screen is a column, not a scroll view, and the bottom pad is the tab bar's — it overlays
  // these forms, which push inside a tab's stack rather than presenting over it.
  column: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  page: { flex: 1, flexDirection: 'row' },
  // 2pt, and it holds its column whether lit or not — the text must never shift sideways when a
  // sitting opens.
  rule: { width: 2, borderRadius: Radius.full, marginRight: Spacing.three },
  /**
   * The page. Not a form control — this one strips the box every other field in the app wears.
   *
   * A bordered, filled, 14pt-radius rectangle is right for a habit's name: a short answer to a
   * short question, in a box that says "answer here". Blown up to the height of a phone it says
   * something else entirely — that a diary entry is data being entered. So the border, the fill and
   * the 16pt inset all come off, and what is left is the app's reading face on the night sky, with
   * the margin rule beside it. It also buys back the inset: the words sit on the screen's own
   * gutter, at the measure they are read back at.
   *
   * `Face.body` because a note is read in Inter everywhere else it appears (the day's card, the
   * Journal) and prose should not change voice between writing it and reading it. Deliberately no
   * `fontWeight` beside the family (Android drops a runtime-registered face when one is set), and
   * deliberately no `lineHeight`: an explicit one on an iOS TextInput clips the glyph box, and this
   * is the one field in the app most likely to contain ā, ḥ, ṣ and ʿ (see FormField).
   */
  field: {
    flex: 1,
    fontFamily: Face.body,
    textAlignVertical: 'top',
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
});
