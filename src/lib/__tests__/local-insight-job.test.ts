import { beforeEach, expect, it, jest } from '@jest/globals';
import { AppState } from 'react-native';

import {
  reflectionJobState,
  startReflection,
  subscribeReflectionJob,
  type ReflectionJob,
} from '@/lib/local-insight-job';
import type { InsightProgress, generateLocalInsight } from '@/lib/local-insight-model';

type Result = Awaited<ReturnType<typeof generateLocalInsight>>;
type Archive = { epoch: number; notesEnabled: boolean; snapshots: Record<string, unknown>; versions: { reading_id: string }[] };

const mockGenerate =
  jest.fn<(snapshot: unknown, history: unknown, signal: AbortSignal, onProgress: (p: InsightProgress) => void) => Promise<Result>>();
const mockWork = { update: jest.fn(), end: jest.fn() };
let mockBegin: (title: string, subtitle: string, onStop: () => void) => Promise<typeof mockWork | null>;
let mockAppState: ((next: 'active' | 'background' | 'inactive' | 'unknown' | 'extension') => void) | null = null;
let mockArchive: Archive;

jest.mock('@/lib/continued-work', () => ({
  beginContinuedWork: (title: string, subtitle: string, onStop: () => void) => mockBegin(title, subtitle, onStop),
}));
jest.mock('@/lib/local-insight-model', () => ({
  INSIGHT_ARTIFACT: 'test-model',
  checkInsightAbort: (signal: AbortSignal) => {
    if (signal.aborted) throw new Error('Generation cancelled.');
  },
  generateLocalInsight: (snapshot: unknown, history: unknown, signal: AbortSignal, onProgress: (p: InsightProgress) => void) =>
    mockGenerate(snapshot, history, signal, onProgress),
}));
jest.mock('@/lib/local-insight-store', () => ({
  readLocalInsights: () => mockArchive,
  subscribeLocalInsights: () => () => {},
  updateLocalInsights: (_userId: string, update: (archive: Archive) => Archive) => {
    mockArchive = update(mockArchive);
  },
}));

const READING = '1448-3-8';
const result: Result = { paragraphs: ['One.', 'Two.', 'Three.'], next_step: 'Read a page.', evidence: null };
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    mockAppState = listener;
    return { remove: () => (mockAppState = null) };
  });
  mockArchive = {
    epoch: 1,
    notesEnabled: false,
    snapshots: { [READING]: { notes: [], capturedAt: '2026-09-12T00:00:00.000Z' } },
    versions: [],
  };
  mockBegin = async () => mockWork;
});

it('streams a draft, saves the finished reflection and ends continued work as a success', async () => {
  mockGenerate.mockImplementation(async (_snapshot, _history, _signal, onProgress) => {
    onProgress({ phase: 'loading', tokens: 0, text: '' });
    await tick();
    onProgress({ phase: 'reading', tokens: 0, text: '' });
    onProgress({ phase: 'writing', tokens: 160, text: '```json\n{"paragraphs": ["One sent' });
    return result;
  });
  const seen: (ReflectionJob | null)[] = [];
  const unsubscribe = subscribeReflectionJob(() => seen.push(reflectionJobState().job));
  await startReflection('user', READING);
  unsubscribe();

  expect(mockArchive.versions).toHaveLength(1);
  expect(mockArchive.versions[0]).toMatchObject({ reading_id: READING, origin: 'local', model: 'test-model', used_notes: false });
  expect(seen.some((job) => job?.draft[0] === 'One sent' && job.background)).toBe(true);
  const fractions = seen.flatMap((job) => (job ? [job.fraction] : []));
  expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  expect(mockWork.update).toHaveBeenLastCalledWith('Writing', fractions.at(-1));
  expect(mockWork.end).toHaveBeenCalledWith(true);
  expect(reflectionJobState()).toEqual({ job: null, error: null });
});

it('cancels without saving when the person stops it from outside the app', async () => {
  let stop = () => {};
  mockBegin = async (_title, _subtitle, onStop) => {
    stop = onStop;
    return mockWork;
  };
  mockGenerate.mockImplementation(async (_snapshot, _history, signal, onProgress) => {
    onProgress({ phase: 'loading', tokens: 0, text: '' });
    await tick();
    stop();
    if (signal.aborted) throw new Error('Generation cancelled.');
    return result;
  });
  await startReflection('user', READING);

  expect(mockArchive.versions).toHaveLength(0);
  expect(reflectionJobState().error).toEqual({
    userId: 'user',
    readingId: READING,
    message: 'Generation cancelled. Saved versions are unchanged.',
  });
  expect(mockWork.end).toHaveBeenCalledWith(false);
});

it('cancels on backgrounding only when the system would not keep the work running', async () => {
  const backgroundMidway = async (
    _snapshot: unknown,
    _history: unknown,
    signal: AbortSignal,
    onProgress: (p: InsightProgress) => void,
  ) => {
    onProgress({ phase: 'loading', tokens: 0, text: '' });
    await tick();
    mockAppState?.('background');
    if (signal.aborted) throw new Error('Generation cancelled.');
    return result;
  };
  mockGenerate.mockImplementation(backgroundMidway);

  mockBegin = async () => null;
  await startReflection('user', READING);
  expect(mockArchive.versions).toHaveLength(0);
  expect(reflectionJobState().error?.message).toBe('Generation cancelled. Saved versions are unchanged.');

  mockBegin = async () => mockWork;
  await startReflection('user', READING);
  expect(mockArchive.versions).toHaveLength(1);
  expect(reflectionJobState().error).toBeNull();
});

it('runs one reflection at a time', async () => {
  mockGenerate.mockImplementation(async () => {
    await tick();
    return result;
  });
  await Promise.all([startReflection('user', READING), startReflection('user', READING)]);
  expect(mockGenerate).toHaveBeenCalledTimes(1);
  expect(mockArchive.versions).toHaveLength(1);
});

it('never asks for continued work when generation fails before the model loads', async () => {
  const begin = jest.fn(async () => mockWork);
  mockBegin = begin;
  mockGenerate.mockRejectedValue(new Error('Download the local model in Settings first.'));
  await startReflection('user', READING);
  expect(begin).not.toHaveBeenCalled();
  expect(reflectionJobState().error?.message).toBe('Download the local model in Settings first.');
});

it('reports a quarter that was never saved for offline use', async () => {
  mockArchive.snapshots = {};
  await startReflection('user', READING);
  expect(mockGenerate).not.toHaveBeenCalled();
  expect(reflectionJobState().error?.message).toBe('Open this quarter online once to save its records.');
});

it('ends continued work that starts only after the reflection already finished', async () => {
  let resolveBegin: (work: typeof mockWork) => void = () => {};
  mockBegin = () => new Promise((resolve) => (resolveBegin = resolve));
  mockGenerate.mockImplementation(async (_snapshot, _history, _signal, onProgress) => {
    onProgress({ phase: 'loading', tokens: 0, text: '' });
    return result;
  });
  await startReflection('user', READING);
  resolveBegin(mockWork);
  await tick();
  expect(mockWork.end).toHaveBeenCalledWith(true);
  expect(reflectionJobState().job).toBeNull();
});
