import { useEffect, useState, useSyncExternalStore } from 'react';

import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { useAuth } from '@/hooks/use-auth';
import { useLocalInsightArchive } from '@/hooks/use-local-insights';
import { confirmDestructive } from '@/lib/alerts';
import {
  cancelInsightDownload,
  downloadInsightModel,
  insightModelState,
  refreshInsightModel,
  removeInsightModel,
  subscribeInsightModel,
} from '@/lib/local-insight-model';
import { clearLocalInsights, setLocalJournalUse } from '@/lib/local-insight-store';

export function LocalInsightSettings() {
  const { user } = useAuth();
  const archive = useLocalInsightArchive();
  const model = useSyncExternalStore(subscribeInsightModel, insightModelState, insightModelState);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void refreshInsightModel();
  }, []);
  const run = (action: () => void | Promise<void>) => {
    void Promise.resolve()
      .then(action)
      .catch(() => setError('Could not update local insight storage. Please retry.'));
  };
  return (
    <SettingsSection
      title="On-device insights"
      footer={
        error ??
        model.error ??
        'New reflections stay on this device and are lost if app data is cleared. Journal sync is unchanged. The model needs about 2.67 GB and may need downloading again if the system clears its cache.'
      }
    >
      <SettingsRow
        icon="sparkle"
        label="Gemma 4 E2B"
        sublabel={
          model.busy
            ? `Downloading · ${Math.round(model.progress * 100)}%`
            : model.ready
              ? 'Downloaded · generates on this device'
              : 'Download once to generate offline'
        }
        onPress={model.busy ? cancelInsightDownload : model.ready ? undefined : () => void downloadInsightModel()}
        value={model.busy ? 'Cancel' : model.ready ? 'Ready' : 'Download'}
      />
      {model.ready ? (
        <SettingsRow icon="deleteOutline" label="Remove downloaded model" onPress={() => run(removeInsightModel)} />
      ) : null}
      <SettingsRow
        icon="privacy"
        label="Use journal notes on this device"
        sublabel="Turning off deletes versions using notes or note-based history."
        switchValue={archive?.notesEnabled ?? false}
        onSwitchChange={(enabled) => {
          if (user) run(() => setLocalJournalUse(user.id, enabled));
        }}
      />
      <SettingsRow
        icon="deleteOutline"
        label="Delete local insights"
        sublabel="Removes saved versions and quarter inputs"
        destructive
        onPress={() =>
          confirmDestructive({
            title: 'Delete local insights?',
            message:
              'All saved versions and quarter inputs on this device will be removed. Your synced journal and habits stay.',
            onConfirm: () => {
              if (user) run(() => clearLocalInsights(user.id));
            },
          })
        }
      />
    </SettingsSection>
  );
}
