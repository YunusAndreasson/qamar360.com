import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { useHabits } from '@/hooks/use-habits';
import { useNotes } from '@/hooks/use-notes';
import { confirmDestructive } from '@/lib/alerts';
import { haptics } from '@/lib/haptics';
import { noteDateTitle } from '@/lib/notes';

/**
 * What you can do to a note — the sheet the editor's `⋯` raises.
 *
 * There is one row on it, and that is the point rather than an omission: everything else you might
 * do to a diary entry is *write in it*, which is the screen underneath. What was missing was the
 * one act the screen underneath cannot express — throwing it away.
 *
 * It could be done before, by selecting every word and saving an empty field, and that is not a
 * feature, it is a side effect somebody has to guess. Every other unit in the app names its own
 * deletion (an act, a stack, an exchange, a to-do all reach one from a `⋯`), and a note is the
 * thing here a person is most likely to want gone.
 *
 * `dismissAll` rather than `back`: deleting leaves the editor behind it holding the text of a row
 * that no longer exists, so the sheet takes the editor with it and lands on whatever raised it —
 * Today, or the Journal.
 */
export default function NoteActionsScreen() {
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day: string }>();
  const { today } = useHabits();
  const { noteFor, deleteNote } = useNotes();

  const note = noteFor(day);
  // The editor only offers the `⋯` for a day that has a saved note, so this is a sheet reached
  // for something already deleted — on another device, or by a slow double tap. Nothing to offer.
  if (!note) return null;

  const confirmDelete = () => {
    confirmDestructive({
      title: 'Delete this note?',
      // Names the day, because this sheet can be raised over a note written years ago and reached
      // through a search — "this note" alone is not enough to be sure which one.
      message: `Your note for ${noteDateTitle(day, today).toLowerCase()} will be gone for good.`,
      confirmLabel: 'Delete',
      onConfirm: () => {
        haptics.removed();
        void (async () => {
          // Only on success. A failed delete leaves the editor open with its banner, which is the
          // one place the message can be read — exactly as a failed save does.
          if (await deleteNote(day)) router.dismissAll();
          else router.back();
        })();
      },
    });
  };

  return (
    <FormSheet title={noteDateTitle(day, today)} subtitle="Note">
      <SheetActions actions={[{ icon: 'delete', label: 'Delete this note', danger: true, onPress: confirmDelete }]} />
    </FormSheet>
  );
}
