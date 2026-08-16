import { useCallback, useEffect, useState } from 'react';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

import { SettingsRow } from '@/components/settings-row';
import { useToast } from '@/components/toast';
import {
  MEANING_MODEL_MB,
  isMeaningModelDownloaded,
  meaningModelSources,
} from '@/hooks/use-semantic-search';
import { confirmDestructive } from '@/lib/alerts';
import { clearEmbedIndex } from '@/lib/notes-embed-cache';
import { setPreference, usePreference } from '@/lib/preferences';

/**
 * Searching the Journal by meaning: the ask, the accounting and the delete, in one row.
 *
 * This app's rule is that the *ask* for bandwidth lives where the feature is wanted and the
 * *accounting* lives in Settings — which is why the voice model is offered at the microphone and
 * merely listed here. Meaning-search breaks that pattern deliberately, because there is no prior
 * moment of wanting it: nobody who has never had semantic search reaches for it halfway through
 * typing a query, and interrupting the Journal — the one screen whose whole virtue is that it is
 * boring and predictable — to offer a download would be the wrong trade. So the row does all three
 * jobs, and **nothing about this model ever appears on the Journal**. Switched off, that screen is
 * exactly the one that shipped.
 *
 * ## One row, not a toggle plus a delete
 *
 * Turning it off deletes the model. That makes the invariant *preference on ⟺ files on disk*, which
 * removes the entire class of "switched on but the model is missing" states — including the one the
 * OS creates by reclaiming storage behind the app's back, which no amount of UI could have made
 * coherent. The apparent cost, that you cannot keep the model while the feature is off, is not a
 * real loss: an unused 91 MB is pure cost.
 *
 * ({@link SettingsSection} also counts a fragment as a single child, so two rows returned together
 * would render without a divider between them — but the state argument above is the reason.)
 */
export function MeaningSearchRow() {
  const toast = useToast();
  const on = usePreference('searchByMeaning');
  const [downloaded, setDownloaded] = useState<boolean | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Asks and answers, setting no state itself — so the effect below reads as what it is.
  const check = useCallback(() => isMeaningModelDownloaded(), []);

  useEffect(() => {
    let active = true;
    void check().then((found) => {
      if (active) setDownloaded(found);
    });
    return () => {
      active = false;
    };
  }, [check]);

  const enable = () => {
    setBusy(true);
    setPercent(0);
    void (async () => {
      try {
        await ExpoResourceFetcher.fetch(
          (progress) => setPercent(Math.round(progress * 100)),
          ...meaningModelSources(),
        );
        setPreference('searchByMeaning', true);
        setDownloaded(true);
      } catch {
        // Left off rather than half-on: the preference is only ever set once the files are actually
        // here, so a failed download cannot leave the Journal claiming a search it cannot run.
        toast.show('Could not download it', 'danger');
        setDownloaded(await check());
      }
      setPercent(null);
      setBusy(false);
    })();
  };

  const disable = () =>
    confirmDestructive({
      title: 'Turn off search by meaning?',
      message: `Frees ${MEANING_MODEL_MB} MB. Your notes are kept, and searching by word still works exactly as it does now. Turning it back on downloads the model again.`,
      confirmLabel: 'Turn off',
      onConfirm: () => {
        setBusy(true);
        void (async () => {
          // The preference goes first, so the Journal stops using the model before the files leave
          // under it. The index is dropped too — keeping a quarter-megabyte of vectors for a
          // feature that is off is exactly the invisible cost this row exists to prevent.
          setPreference('searchByMeaning', false);
          clearEmbedIndex();
          try {
            await ExpoResourceFetcher.deleteResources(...meaningModelSources());
          } catch {
            toast.show('Could not delete it', 'danger');
          }
          setDownloaded(await check());
          setBusy(false);
        })();
      },
    });

  return (
    <SettingsRow
      icon="searchMeaning"
      label="Search by meaning"
      sublabel={sublabel({ on, downloaded, percent })}
      switchValue={on}
      disabled={busy || downloaded === null}
      busy={busy}
      accessibilityLabel={
        on
          ? `Turn off search by meaning, freeing ${MEANING_MODEL_MB} megabytes`
          : `Turn on search by meaning, a ${MEANING_MODEL_MB} megabyte download`
      }
      onSwitchChange={(next) => (next ? enable() : disable())}
    />
  );
}

/**
 * What the row says under its label.
 *
 * The size is quoted **before** the tap when it is off and **after** it when it is on — the same
 * number doing two different jobs, as a price and then as an account. Neither is a promise about
 * how good the search will be, which is not a thing this row can honestly claim.
 */
function sublabel({
  on,
  downloaded,
  percent,
}: {
  on: boolean;
  downloaded: boolean | null;
  percent: number | null;
}): string {
  if (percent !== null) return `Downloading… ${percent}%`;
  if (on && downloaded === false) return 'The model is missing. Turn it off and on to fetch it again.';
  if (on) return `On this phone · ${MEANING_MODEL_MB} MB`;
  return `Find a note by what it means, not the words in it · ${MEANING_MODEL_MB} MB`;
}
