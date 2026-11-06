import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { haptics } from '@/lib/haptics';

// Android, at whatever API level a test sets. The module reads Platform.OS once, at import, and
// Platform.Version per call, so a plain object stands in for react-native's Platform.
jest.mock('react-native', () => ({ Platform: { OS: 'android', Version: 34 } }));
jest.mock('expo-haptics', () => ({
  // The real enums' values (expo-haptics build/Haptics.types.js); the Android ones are also the
  // strings HapticsTypes.kt matches on. The real module pulls in all of expo, so it is not loaded.
  AndroidHaptics: {
    Confirm: 'confirm',
    Reject: 'reject',
    Gesture_Start: 'gesture-start',
    Gesture_End: 'gesture-end',
    Toggle_On: 'toggle-on',
    Toggle_Off: 'toggle-off',
    Clock_Tick: 'clock-tick',
    Context_Click: 'context-click',
    Drag_Start: 'drag-start',
    Keyboard_Tap: 'keyboard-tap',
    Long_Press: 'long-press',
    Virtual_Key: 'virtual-key',
    Segment_Tick: 'segment-tick',
    Segment_Frequent_Tick: 'segment-frequent-tick',
  },
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/preferences', () => ({ getPreference: () => true }));
jest.mock('@/constants/motion', () => ({ Tick: { sweep: 0 } }));

const performAndroid = jest.mocked(Haptics.performAndroidHapticsAsync);
const A = Haptics.AndroidHaptics;

// `addedInSdk` in expo-haptics' android/.../arguments/HapticsTypes.kt, keyed by each constant's
// string value. The native module rejects a constant its OS predates and `run` swallows the
// rejection, so a constant asked for below its level is a haptic lost without a trace.
const ADDED_IN_SDK: Record<string, number> = {
  'clock-tick': 1,
  'context-click': 1,
  'keyboard-tap': 1,
  'long-press': 1,
  'virtual-key': 1,
  'keyboard-press': 27,
  'keyboard-release': 27,
  'text-handle-move': 27,
  'virtual-key-release': 27,
  confirm: 30,
  reject: 30,
  'gesture-start': 30,
  'gesture-end': 30,
  'drag-start': 34,
  'no-haptics': 34,
  'segment-tick': 34,
  'segment-frequent-tick': 34,
  'toggle-on': 34,
  'toggle-off': 34,
};

function onAndroid(apiLevel: number) {
  Object.assign(Platform, { Version: apiLevel });
}

/** The constant the last Android haptic asked for. */
function lastConstant() {
  return performAndroid.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  jest.useFakeTimers();
  performAndroid.mockClear();
});

describe('Android haptics below each API floor', () => {
  // Regression: Confirm, Reject and Gesture_End arrived in API 30, Segment_Tick, Toggle_On/Off and
  // Drag_Start in API 34, and the app installs from API 24. On every older phone the native call
  // threw, `run` swallowed it, and ticking a habit, adding one or dragging a row was felt as nothing.
  it.each([24, 26, 29, 30, 33, 34, 36])('asks for a constant API %i has, for every intent', (apiLevel) => {
    onAndroid(apiLevel);

    for (const fire of Object.values(haptics)) fire();
    haptics.celebrate(0.1); // the new-moon branch
    haptics.celebrate(0.9); // the full-moon branch and its tail beat
    jest.runAllTimers();

    // A constant missing from ADDED_IN_SDK counts as unavailable: add its level from
    // HapticsTypes.kt rather than loosening this.
    const unavailable = performAndroid.mock.calls
      .map(([constant]) => constant)
      .filter((constant) => (ADDED_IN_SDK[constant] ?? Infinity) > apiLevel);
    expect(performAndroid.mock.calls.length).toBeGreaterThanOrEqual(Object.keys(haptics).length);
    expect(unavailable).toEqual([]);
  });

  it('keeps the newer constant on a phone that has it', () => {
    onAndroid(34);
    haptics.selection();
    expect(lastConstant()).toBe(A.Segment_Tick);
    haptics.pickup();
    expect(lastConstant()).toBe(A.Drag_Start);
    haptics.completed();
    expect(lastConstant()).toBe(A.Toggle_On);
    haptics.added();
    expect(lastConstant()).toBe(A.Confirm);
  });

  it('falls back to an older constant on a phone that lacks it', () => {
    onAndroid(33);
    haptics.selection();
    expect(lastConstant()).toBe(A.Clock_Tick);
    haptics.pickup();
    expect(lastConstant()).toBe(A.Long_Press);
    haptics.completed();
    expect(lastConstant()).toBe(A.Virtual_Key);
    haptics.uncompleted();
    expect(lastConstant()).toBe(A.Clock_Tick);

    onAndroid(29);
    haptics.added();
    expect(lastConstant()).toBe(A.Virtual_Key);
    haptics.removed();
    expect(lastConstant()).toBe(A.Long_Press);
    haptics.drop();
    expect(lastConstant()).toBe(A.Virtual_Key);
  });
});
