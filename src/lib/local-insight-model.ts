import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  insightPrompt,
  LOCAL_INSIGHT_SYSTEM,
  parseLocalInsight,
  type InsightSnapshot,
  type InsightVersion,
} from '@/lib/local-insight-context';

import type * as BlobUtil from 'react-native-blob-util';
import type * as DeviceInfo from 'react-native-device-info';
import type * as ExecuTorch from 'react-native-executorch';

export function checkInsightAbort(signal: AbortSignal) {
  if (signal.aborted) throw new Error('Generation cancelled.');
}

export const INSIGHT_ARTIFACT = 'gemma-4-e2b-xnnpack:e20831dd07f0f0d2bb6ee85e204e974a8a69b903';
const BASE =
  'https://huggingface.co/software-mansion/react-native-executorch-gemma-4/resolve/e20831dd07f0f0d2bb6ee85e204e974a8a69b903/e2b/';
const FILES = [
  {
    key: 'modelPath',
    name: 'gemma.pte',
    remote: 'xnnpack/gemma_4_e2b_xnnpack_8da4w.pte',
    size: 2635017344,
    hash: 'f0abfce95c3341a90155489792e69a60dde3d14eb7a5f90b7c0af52a20394878',
  },
  {
    key: 'tokenizerPath',
    name: 'tokenizer.json',
    remote: 'tokenizer.json',
    size: 32169868,
    hash: '23f2c12a98a259a87ba6b24df2750aa238f8f688935a9a89e1ce1e86ef7f095a',
  },
  {
    key: 'tokenizerConfigPath',
    name: 'tokenizer_config.json',
    remote: 'tokenizer_config.json',
    size: 22312,
    hash: '728f10e49dc4571c7679124165390d546d8930be3b9042a7a4e2fcefc45650b2',
  },
] as const;
const TOTAL = FILES.reduce((sum, f) => sum + f.size, 0);
// Model files are replaceable and excluded from cloud backup by using the cache directory.
const directory = `${FileSystem.cacheDirectory}insight-gemma-e20831dd/`;
type ModelState = { ready: boolean; busy: boolean; progress: number; error: string | null };
let state: ModelState = { ready: false, busy: false, progress: 0, error: null };
const listeners = new Set<() => void>();
let downloadController: AbortController | null = null;
let generating = false;
const publish = (next: Partial<ModelState>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};
export const insightModelState = () => state;
export function subscribeInsightModel(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

async function runtime() {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    throw new Error('Local generation is available in the iOS and Android apps.');
  try {
    // Lazy require keeps saved insights usable in an older development binary.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('react-native-executorch') as typeof ExecuTorch;
    api.setTelemetryEnabled(false);
    if (!api.getRegisteredBackends().includes('XnnpackBackend')) throw new Error('Missing backend');
    return api;
  } catch {
    throw new Error('Local generation needs a new native app build with the inference runtime.');
  }
}
export async function refreshInsightModel() {
  try {
    const checks = await Promise.all(
      FILES.map(async (f) => {
        const info = await FileSystem.getInfoAsync(directory + f.name);
        return info.exists && info.size === f.size;
      }),
    );
    publish({ ready: checks.every(Boolean) });
  } catch {
    publish({ ready: false });
  }
}
export function cancelInsightDownload() {
  downloadController?.abort();
}
export async function downloadInsightModel() {
  if (state.busy || generating) return;
  const controller = new AbortController();
  downloadController = controller;
  publish({ busy: true, progress: 0, error: null });
  try {
    await runtime();
    // Keep native modules lazy without Metro's development-only async bundle loading.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const blob = (require('react-native-blob-util') as typeof BlobUtil).default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const device = (require('react-native-device-info') as typeof DeviceInfo).default;
    if ((await device.getTotalMemory()) < 6 * 1024 ** 3)
      throw new Error('This model requires a device with at least 6 GB of memory. Saved reflections remain available.');
    if ((await FileSystem.getFreeDiskStorageAsync()) < TOTAL + 512 * 1024 ** 2)
      throw new Error('Free at least 3.2 GB of storage before downloading.');
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    let completed = 0;
    for (const file of FILES) {
      checkInsightAbort(controller.signal);
      const target = directory + file.name;
      const info = await FileSystem.getInfoAsync(target);
      if (info.exists && info.size === file.size) {
        completed += file.size;
        continue;
      }
      const partial = target + '.part';
      const task = FileSystem.createDownloadResumable(BASE + file.remote, partial, {}, (p) =>
        publish({ progress: (completed + p.totalBytesWritten) / TOTAL }),
      );
      const pause = () => {
        void task.pauseAsync().catch(() => undefined);
      };
      controller.signal.addEventListener('abort', pause);
      try {
        const result = await task.downloadAsync();
        checkInsightAbort(controller.signal);
        const downloaded = await FileSystem.getInfoAsync(partial);
        if (
          result?.status !== 200 ||
          !downloaded.exists ||
          downloaded.size !== file.size ||
          (await blob.fs.hash(partial.replace('file://', ''), 'sha256')) !== file.hash
        )
          throw new Error('The model download was incomplete. Please retry.');
        checkInsightAbort(controller.signal);
        await FileSystem.moveAsync({ from: partial, to: target });
      } finally {
        controller.signal.removeEventListener('abort', pause);
        await FileSystem.deleteAsync(partial, { idempotent: true });
      }
      completed += file.size;
      publish({ progress: completed / TOTAL });
    }
    publish({ ready: true });
  } catch (error) {
    publish({
      error: controller.signal.aborted
        ? 'Download cancelled. You can retry anytime.'
        : error instanceof Error
          ? error.message
          : 'Could not download the model.',
    });
  } finally {
    downloadController = null;
    publish({ busy: false });
  }
}
export async function removeInsightModel() {
  if (state.busy || generating) throw new Error('Wait for the current operation to finish.');
  await FileSystem.deleteAsync(directory, { idempotent: true });
  publish({ ready: false, progress: 0, error: null });
}

/** Where a generation is. `text` is the reply so far, and only grows while writing. */
export type InsightProgress = { phase: 'loading' | 'reading' | 'writing'; tokens: number; text: string };

export async function generateLocalInsight(
  snapshot: InsightSnapshot,
  history: InsightVersion[],
  signal: AbortSignal,
  onProgress: (progress: InsightProgress) => void = () => {},
) {
  if (generating || state.busy) throw new Error('Another model operation is in progress.');
  generating = true;
  let session: Awaited<ReturnType<typeof ExecuTorch.createLLMChatSession>> | undefined;
  let tokenizer: Awaited<ReturnType<typeof ExecuTorch.createTokenizer>> | undefined;
  const stop = () => session?.stop();
  signal.addEventListener('abort', stop);
  try {
    checkInsightAbort(signal);
    await refreshInsightModel();
    if (!state.ready) throw new Error('Download the local model in Settings first.');
    const api = await runtime();
    const paths = Object.fromEntries(FILES.map((f) => [f.key, (directory + f.name).replace('file://', '')])) as {
      modelPath: string;
      tokenizerPath: string;
      tokenizerConfigPath: string;
    };
    tokenizer = await api.createTokenizer(paths.tokenizerPath);
    let prompt = insightPrompt(snapshot, history);
    const compact = (await tokenizer.encode(LOCAL_INSIGHT_SYSTEM + prompt)).length > 2800;
    if (compact)
      prompt = insightPrompt(snapshot, history, true);
    if ((await tokenizer.encode(LOCAL_INSIGHT_SYSTEM + prompt)).length > 2800)
      throw new Error(
        'These records exceed the local model’s context limit. Shorten long habit names or notes and retry.',
      );
    tokenizer.dispose();
    tokenizer = undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      checkInsightAbort(signal);
      onProgress({ phase: 'loading', tokens: 0, text: '' });
      session = await api.createLLMChatSession(paths, {
        initialMessages: [{ role: 'system', content: LOCAL_INSIGHT_SYSTEM }],
        // ExecuTorch echoes the prompt into the reply by default, which here is the
        // "<|turn>model" header, so every reply would start with it and fail to parse.
        generationConfig: { echo: false, maxNewTokens: 900, temperature: 0.35 },
      });
      checkInsightAbort(signal);
      onProgress({ phase: 'reading', tokens: 0, text: '' });
      let text = '';
      let tokens = 0;
      const result = await session.sendMessage(
        prompt + (attempt ? '\nReturn only the specified JSON object. The previous output was invalid.' : ''),
        (token) => {
          text += token;
          tokens += 1;
          onProgress({ phase: 'writing', tokens, text });
        },
      );
      checkInsightAbort(signal);
      const reply = result.messages.findLast((m) => m.role === 'assistant')?.content;
      const parsed =
        typeof reply === 'string'
          ? parseLocalInsight(
              reply,
              snapshot.evidence
                .slice(0, compact ? 1 : 2)
                .filter((e) => e.text.length <= 1200),
            )
          : null;
      session.dispose();
      session = undefined;
      if (parsed) return parsed;
    }
    throw new Error('The model could not produce a valid reflection. Your saved versions are unchanged.');
  } finally {
    signal.removeEventListener('abort', stop);
    session?.dispose();
    tokenizer?.dispose();
    generating = false;
  }
}
