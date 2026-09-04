import { Stack, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ErrorBanner } from '@/components/error-banner';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useAiNoteConsent } from '@/hooks/use-ai-note-consent';
import { useAuth } from '@/hooks/use-auth';
import { useRefreshLifecycle } from '@/hooks/use-refresh-lifecycle';
import { dailyNoteRefresh } from '@/lib/daily-note';
import { todayLocalISO } from '@/lib/dates';
import { supabase } from '@/lib/supabase';

const MAX_NOTE_LENGTH = 4000;

/** Today's private reflection. Older notes are retained for future insights but not browsable yet. */
export default function DailyNoteScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const {
    enabled,
    loading: consentLoading,
    error: consentError,
    dismissError: dismissConsentError,
    setEnabled,
  } = useAiNoteConsent();
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
    <FormScreen keyboardDismissMode="interactive">
      <Stack.Screen
        options={{
          title: 'Daily reflection',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: () => void save(), canSave }),
        }}
      />
      <ErrorBanner
        message={error ?? consentError}
        onDismiss={() => {
          setError(null);
          dismissConsentError();
        }}
      />
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
        style={styles.note}
      />
      <SettingsSection footer="When on, only notes written inside a closed lunar quarter may shape that quarter’s deeper insight. Your words are not quoted, logged, or shown in notifications. Turning this off removes insights that used notes.">
        <SettingsRow
          icon="privacy"
          label="Use notes in deeper insights"
          sublabel={consentLoading ? 'Loading privacy setting…' : enabled ? 'Allowed' : 'Not allowed'}
          switchValue={enabled}
          onSwitchChange={(next) => void setEnabled(next)}
        />
      </SettingsSection>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  note: { minHeight: 240, paddingTop: Spacing.three },
});
