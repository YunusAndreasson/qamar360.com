import { beforeEach, expect, it, jest } from '@jest/globals';

import { beginContinuedWork } from '@/lib/continued-work';

type StopListener = (event: { reason: string }) => void;

const mockRemove = jest.fn();
let mockListener: StopListener | null = null;
let mockAvailable = true;
const mockNative = {
  isSupported: jest.fn<() => boolean>(),
  begin: jest.fn<(title: string, subtitle: string) => Promise<void>>(),
  update: jest.fn<(title: string, subtitle: string, completed: number, total: number) => void>(),
  end: jest.fn<(success: boolean) => void>(),
  addListener: jest.fn((_event: string, listener: StopListener) => {
    mockListener = listener;
    return { remove: mockRemove };
  }),
};

jest.mock('expo', () => ({
  NativeModule: class {},
  requireOptionalNativeModule: () => (mockAvailable ? mockNative : null),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  mockListener = null;
  mockNative.isSupported.mockReturnValue(true);
  mockNative.begin.mockResolvedValue(undefined);
});

it('returns null where the system will not keep work running, so the caller stays in the foreground', async () => {
  mockAvailable = false;
  expect(await beginContinuedWork('Title', 'Starting', () => {})).toBeNull();

  mockAvailable = true;
  mockNative.isSupported.mockReturnValue(false);
  expect(await beginContinuedWork('Title', 'Starting', () => {})).toBeNull();
  expect(mockNative.begin).not.toHaveBeenCalled();

  mockNative.isSupported.mockReturnValue(true);
  mockNative.begin.mockRejectedValue(new Error('immediate run ineligible'));
  expect(await beginContinuedWork('Title', 'Starting', () => {})).toBeNull();
  expect(mockRemove).toHaveBeenCalledTimes(1);
});

it('sends progress only when what the system shows would change, and ends once', async () => {
  const work = await beginContinuedWork('Title', 'Starting', () => {});
  work!.update('Writing', 0.101);
  work!.update('Writing', 0.104);
  work!.update('Writing', 0.2);
  work!.update('Writing', 7);
  expect(mockNative.update.mock.calls).toEqual([
    ['Title', 'Writing', 10, 100],
    ['Title', 'Writing', 20, 100],
    ['Title', 'Writing', 100, 100],
  ]);

  work!.end(true);
  work!.end(false);
  work!.update('Writing', 0.5);
  expect(mockNative.end.mock.calls).toEqual([[true]]);
  expect(mockNative.update).toHaveBeenCalledTimes(3);
  expect(mockRemove).toHaveBeenCalledTimes(1);
});

it('passes a stop from outside the app to the caller without ending the native work twice', async () => {
  const onStop = jest.fn();
  const work = await beginContinuedWork('Title', 'Starting', onStop);
  mockListener?.({ reason: 'expired' });
  mockListener?.({ reason: 'expired' });
  expect(onStop).toHaveBeenCalledTimes(1);

  work!.end(false);
  expect(mockNative.end).not.toHaveBeenCalled();
});
