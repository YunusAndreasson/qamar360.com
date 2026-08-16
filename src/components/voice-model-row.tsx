import { useCallback, useEffect, useState } from 'react';
import { ModelCategory, deleteModelByCategory, isModelDownloadedByCategory } from 'react-native-sherpa-onnx/download';

import { SettingsRow } from '@/components/settings-row';
import { useToast } from '@/components/toast';
import { VOICE_MODEL_DISK_MB, VOICE_MODEL_ID } from '@/hooks/use-dictation';
import { confirmDestructive } from '@/lib/alerts';

/**
 * The voice model, in Settings — because 106 MB of somebody's storage should be visible somewhere
 * they can see it and get it back.
 *
 * It is the largest thing this app ever puts on a phone — 106 MB downloaded, 141 MB unpacked —
 * and it arrives from inside a feature rather than at install, which is exactly the kind of disk use
 * that otherwise becomes invisible.
 * Deleting it costs nothing permanent: notes already written stay, typing still works, and the next
 * recording offers the download again.
 */
export function VoiceModelRow() {
  const toast = useToast();
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  // Asks, and answers — it does not set state itself, so the effect below reads as what it is: a
  // subscription to something outside React, resolving into state in a callback.
  const check = useCallback(
    () =>
      isModelDownloadedByCategory(ModelCategory.Stt, VOICE_MODEL_ID).catch(() =>
        // The row simply doesn't offer a delete it can't verify — never a Settings screen that
        // fails to render because a model registry was unreachable.
        false,
      ),
    [],
  );

  useEffect(() => {
    let active = true;
    void check().then((found) => {
      if (active) setDownloaded(found);
    });
    return () => {
      active = false;
    };
  }, [check]);

  const remove = () =>
    confirmDestructive({
      title: 'Delete the voice model?',
      message: `Frees ${VOICE_MODEL_DISK_MB} MB. Your notes are kept, and you can still type them. Recording again will offer the download.`,
      onConfirm: () => {
        setBusy(true);
        void (async () => {
          try {
            await deleteModelByCategory(ModelCategory.Stt, VOICE_MODEL_ID);
            toast.show('Voice model deleted', 'success');
          } catch {
            toast.show('Could not delete it', 'danger');
          }
          setBusy(false);
          setDownloaded(await check());
        })();
      },
    });

  // Nothing to say until we know, and nothing to offer if it was never downloaded — the place to
  // get it is the note itself, at the moment it is wanted.
  if (downloaded !== true) return null;

  return (
    <SettingsRow
      icon="mic"
      label="Voice model"
      sublabel={`On this device · ${VOICE_MODEL_DISK_MB} MB`}
      value="Delete"
      destructive
      busy={busy}
      disabled={busy}
      accessibilityLabel={`Delete the voice model, freeing ${VOICE_MODEL_DISK_MB} megabytes`}
      onPress={remove}
    />
  );
}
