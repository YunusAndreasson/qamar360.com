import { beforeEach, expect, it, jest } from '@jest/globals';

import type { InsightSnapshot } from '@/lib/local-insight-context';
import { downloadInsightModel, generateLocalInsight, insightModelState } from '@/lib/local-insight-model';

const mockReply = jest.fn<(...args: unknown[]) => Promise<{ messages: { role: string; content?: string }[] }>>();
const mockStop = jest.fn();
const mockDispose = jest.fn();
const mockCreate =
  jest.fn<
    (
      ...args: unknown[]
    ) => Promise<{ sendMessage: typeof mockReply; stop: typeof mockStop; dispose: typeof mockDispose }>
  >();
const mockEncode = jest.fn<() => Promise<number[]>>();
const mockDownload = jest.fn();
const mockTelemetry = jest.fn();
let mockFilesPresent = true;

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: async (path: string) => ({
    exists: mockFilesPresent,
    size: path.endsWith('gemma.pte') ? 2635017344 : path.endsWith('tokenizer.json') ? 32169868 : 22312,
  }),
  createDownloadResumable: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock('react-native-executorch', () => ({
  setTelemetryEnabled: (...args: unknown[]) => mockTelemetry(...args),
  getRegisteredBackends: () => ['XnnpackBackend'],
  createTokenizer: async () => ({ encode: mockEncode, dispose: jest.fn() }),
  createLLMChatSession: (...args: unknown[]) => mockCreate(...args),
}));
jest.mock('react-native-blob-util', () => ({ __esModule: true, default: {} }));
jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: { getTotalMemory: async () => 5 * 1024 ** 3 },
}));

const snapshot = {
  facts: { reading: { quarter: {}, span: {}, previous: null } },
  capturedAt: '2026-01-01',
  habits: [],
  goals: [],
  notes: [],
  evidence: [],
} as unknown as InsightSnapshot;
const good = { paragraphs: ['One.', 'Two.', 'Three.'], next_step: 'Read a page.', evidence_preset_id: null };
beforeEach(() => {
  jest.clearAllMocks();
  mockFilesPresent = true;
  mockEncode.mockResolvedValue([1, 2]);
  mockReply.mockResolvedValue({ messages: [{ role: 'assistant', content: JSON.stringify(good) }] });
  mockCreate.mockImplementation(async () => ({ sendMessage: mockReply, stop: mockStop, dispose: mockDispose }));
});
it('uses local paths, disables telemetry and performs no model downloads during generation', async () => {
  const result = await generateLocalInsight(snapshot, [], new AbortController().signal);
  expect(result.next_step).toBe('Read a page.');
  expect(mockCreate.mock.calls[0]![0]).toEqual({
    modelPath: '/cache/insight-gemma-e20831dd/gemma.pte',
    tokenizerPath: '/cache/insight-gemma-e20831dd/tokenizer.json',
    tokenizerConfigPath: '/cache/insight-gemma-e20831dd/tokenizer_config.json',
  });
  expect(mockTelemetry).toHaveBeenCalledWith(false);
  expect(mockDownload).not.toHaveBeenCalled();
  expect(mockDispose).toHaveBeenCalledTimes(1);
});
it('reports each phase and every written token', async () => {
  const reply = JSON.stringify(good);
  mockReply.mockImplementation(async (_message, onToken) => {
    (onToken as (token: string) => void)(reply.slice(0, 12));
    (onToken as (token: string) => void)(reply.slice(12));
    return { messages: [{ role: 'assistant', content: reply }] };
  });
  const seen: { phase: string; tokens: number; text: string }[] = [];
  await generateLocalInsight(snapshot, [], new AbortController().signal, (progress) => seen.push(progress));
  expect(seen).toEqual([
    { phase: 'loading', tokens: 0, text: '' },
    { phase: 'reading', tokens: 0, text: '' },
    { phase: 'writing', tokens: 1, text: reply.slice(0, 12) },
    { phase: 'writing', tokens: 2, text: reply },
  ]);
});
it('repeats a stop that arrived before writing began, and reports nothing written', async () => {
  const controller = new AbortController();
  const seen: string[] = [];
  mockReply.mockImplementation(async (_message, onToken) => {
    controller.abort();
    (onToken as (token: string) => void)('{"paragraphs"');
    return { messages: [{ role: 'assistant', content: '{"paragraphs"' }] };
  });
  await expect(
    generateLocalInsight(snapshot, [], controller.signal, (progress) => seen.push(progress.phase)),
  ).rejects.toThrow('cancelled');
  expect(mockStop).toHaveBeenCalledTimes(2);
  expect(seen).not.toContain('writing');
});
it('keeps the prompt out of the reply', async () => {
  await generateLocalInsight(snapshot, [], new AbortController().signal);
  expect(mockCreate.mock.calls[0]![1]).toMatchObject({ generationConfig: { echo: false } });
});
it('retries malformed output once in a fresh session and then fails', async () => {
  mockReply.mockResolvedValue({ messages: [{ role: 'assistant', content: 'invalid' }] });
  await expect(generateLocalInsight(snapshot, [], new AbortController().signal)).rejects.toThrow('could not be used');
  expect(mockCreate).toHaveBeenCalledTimes(2);
  expect(mockDispose).toHaveBeenCalledTimes(2);
});
it('cancels and releases resources without returning partial output', async () => {
  const controller = new AbortController();
  mockReply.mockImplementation(async () => {
    controller.abort();
    return { messages: [] };
  });
  await expect(generateLocalInsight(snapshot, [], controller.signal)).rejects.toThrow();
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(mockDispose).toHaveBeenCalledTimes(1);
});
it('does not silently download or call cloud inference when the model is absent', async () => {
  mockFilesPresent = false;
  await expect(generateLocalInsight(snapshot, [], new AbortController().signal)).rejects.toThrow('Download');
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockDownload).not.toHaveBeenCalled();
});
it('supports React Native abort signals without throwIfAborted', async () => {
  const signal = new AbortController().signal;
  Object.defineProperty(signal, 'throwIfAborted', { value: undefined });
  mockFilesPresent = false;
  await expect(generateLocalInsight(snapshot, [], signal)).rejects.toThrow('Download');
});
it('rejects oversized input before loading model weights', async () => {
  mockEncode.mockResolvedValue(new Array(2900).fill(1));
  await expect(generateLocalInsight(snapshot, [], new AbortController().signal)).rejects.toThrow('read at once');
  expect(mockCreate).not.toHaveBeenCalled();
});
it('blocks a download on low-memory devices before requesting model files', async () => {
  await downloadInsightModel();
  expect(insightModelState().error).toContain('at least 6 GB');
  expect(insightModelState().busy).toBe(false);
  expect(mockDownload).not.toHaveBeenCalled();
});
