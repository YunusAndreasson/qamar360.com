import { Stack, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ErrorBanner } from '@/components/error-banner';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { dailyNoteRefresh } from '@/lib/daily-note';
import { todayLocalISO } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

const MAX_NOTE_LENGTH = 4000;

/**
 * Today's private reflection. Older notes are retained for future insights but not browsable yet.
 *
 * One field, and it takes the whole screen. The AI-consent switch used to sit under it — the same
 * switch Settings already carries under "Personal insights" — so a setting you touch once was in
 * the way every single time you wrote a note, and the composer got 240pt while a permanent
 * duplicate got the rest. The consent lives in Settings alone now.
 */
export default function DailyNoteScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A composer belongs to the day on which it opened. Pinning the date prevents a midnight
  // render or refresh from replacing unsaved text with the next day's empty note.
  const [noteDate] = useState(todayLocalISO);
  const [dayChanged, setDayChanged] = useState(false);
  const noteRef = useRef('');
  const savedNoteRef = useRef('');
  const todayRef = useRef(noteDate);

  const load = useCallback(async () => {
    if (!user) return;
    const currentDay = todayLocalISO();
    const refresh = dailyNoteRefresh(noteDate, currentDay, noteRef.current, savedNoteRef.current);
    todayRef.current = currentDay;
    if (refresh.dayChanged) setDayChanged(true);
    // Focus/app-state refreshes must never overwrite local edits, at midnight or otherwise.
    if (!refresh.shouldLoad) return;
    const { data, error: readError } = await supabase
      .from('daily_notes')
      .select('body')
      .eq('user_id', user.id)
      .eq('note_date', noteDate)
      .maybeSingle();
    if (readError) {
      setError('Could not load today’s note.');
      return;
    }
    const content = data?.body ?? '';
    noteRef.current = content;
    savedNoteRef.current = content;
    setNote(content);
    setSavedNote(content);
    setError(null);
  }, [noteDate, user]);

  useRefreshLifecycle(user?.id ?? null, load, todayRef, setLoading);

  const trimmed = note.trim();
  const changed = trimmed !== savedNote;
  const canSave = !loading && !saving && changed;
  const save = async () => {
    if (!user || !canSave) return;
    setSaving(true);
    setError(null);
    const result = trimmed
      ? await supabase.from('daily_notes').upsert(
          { user_id: user.id, note_date: noteDate, body: trimmed, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,note_date' },
        )
      : await supabase.from('daily_notes').delete().eq('user_id', user.id).eq('note_date', noteDate);
    setSaving(false);
    if (result.error) {
      setError('Could not save today’s note. Check your connection.');
      return;
    }
    setSavedNote(trimmed);
    toast.show(trimmed ? 'Today’s reflection saved.' : 'Today’s reflection cleared.', 'success');
    router.back();
  };

  return (
    <FormScreen keyboardDismissMode="interactive" contentContainerStyle={styles.screen}>
      <Stack.Screen
        options={{
          title: 'Daily reflection',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: () => void save(), canSave }),
        }}
      />
      <ErrorBanner message={error} onDismiss={() => setError(null)} />
      <FormField
        label={dayChanged ? `STARTED ${noteDate}` : 'TODAY'}
        value={note}
        onChangeText={(value) => {
          const currentDay = todayLocalISO();
          if (currentDay !== noteDate) {
            todayRef.current = currentDay;
            setDayChanged(true);
          }
          noteRef.current = value;
          setNote(value);
        }}
        placeholder="What was easy, difficult, or present in your heart today?"
        hint={
          dayChanged
            ? `${note.length}/${MAX_NOTE_LENGTH} · Saves to ${noteDate}; reopen for today`
            : `${note.length}/${MAX_NOTE_LENGTH} · Private to your account`
        }
        accessibilityLabel="Today’s reflection"
        multiline
        maxLength={MAX_NOTE_LENGTH}
        textAlignVertical="top"
        fill
        style={styles.note}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  // The content is at least a screenful, so the field below can take what the label, the hint and
  // the gutters leave — without it `flex: 1` has nothing to divide.
  screen: { flexGrow: 1 },
  // `minHeight` survives as a floor, for a viewport too short to give the field a screenful
  // (landscape, a large accessibility text size): there the content scrolls, as it did before.
  note: { minHeight: 240, paddingTop: Spacing.three },
});
