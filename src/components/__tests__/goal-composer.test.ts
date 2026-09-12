import { afterEach, beforeAll, beforeEach, expect, it, jest } from '@jest/globals';
import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { AppButton } from '@/components/app-button';
import { FormField } from '@/components/form-field';
import GoalComposerScreen from '@/components/goal-composer';
import { SelectablePill } from '@/components/selectable-pill';
import type { Goal } from '@/lib/goals';

const mockBack = jest.fn();
const mockCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockUpdate = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockCheckIn = jest.fn<(...args: unknown[]) => Promise<boolean>>();
let mockId: string | undefined;
let mockGoals: Goal[] = [];
let mockLoading = false;
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: mockId }),
  useRouter: () => ({ back: mockBack }),
}));
jest.mock('@/hooks/use-goals', () => ({ useGoals: () => ({
  goals: mockGoals, loading: mockLoading, checkIns: [],
  createGoal: mockCreate, updateGoal: mockUpdate, saveCheckIn: mockCheckIn,
}) }));
jest.mock('@/components/form-screen', () => ({ FormScreen: 'FormScreen' }));
jest.mock('@/components/form-field', () => ({ FormField: 'FormField' }));
jest.mock('@/components/field-label', () => ({ FieldLabel: 'FieldLabel' }));
jest.mock('@/components/themed-text', () => ({ ThemedText: 'ThemedText' }));
jest.mock('@/components/app-button', () => ({ AppButton: 'AppButton' }));
jest.mock('@/components/selectable-pill', () => ({ SelectablePill: 'SelectablePill' }));
jest.mock('@/components/weekday-picker', () => ({ WeekdayPicker: 'WeekdayPicker' }));
jest.mock('@/components/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptics: { added: jest.fn(), selection: jest.fn() } }));

let renderer: ReactTestRenderer;
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
beforeEach(() => {
  jest.clearAllMocks(); mockId = undefined; mockGoals = []; mockLoading = false;
  mockCreate.mockResolvedValue({ id: 'created' }); mockUpdate.mockResolvedValue(true); mockCheckIn.mockResolvedValue(true);
});
afterEach(async () => { await act(async () => renderer?.unmount()); });
async function mount() { await act(async () => { renderer = create(createElement(GoalComposerScreen)); }); }
async function fill(label: string, value: string) {
  await act(async () => renderer.root.findAllByType(FormField).find((field) => field.props.label === label)!.props.onChangeText(value));
}
async function submit() { await act(async () => renderer.root.findByType(AppButton).props.onPress()); }
async function fillGoal() {
  await fill('Goal name', 'Read books'); await fill('Target amount', '12,5'); await fill('Unit', 'books');
  await fill('Current amount (books)', '0');
}

it('opens directly in the goal form with optional planning collapsed', async () => {
  await mount();
  expect(renderer.root.findAllByType(FormField).map((field) => field.props.label)).toEqual([
    'Goal name', 'Target amount', 'Unit', 'Current amount',
  ]);
  expect(renderer.root.findByType(AppButton).props.children).toBe('Create goal');
});
it('explains missing inputs and saves decimal amounts without creating template habits', async () => {
  await mount(); await submit();
  expect(mockCreate).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(FormField)[0]!.props.error).toBe('Give your goal a name.');
  await fillGoal(); await submit();
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Read books', target_value: 12.5, unit: 'books', startValue: 0, acts: [], milestone_step: null,
  }));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
it('allows creation without a starting reading when no schedule is selected', async () => {
  await mount(); await fill('Goal name', 'Read'); await fill('Target amount', '12'); await fill('Unit', 'books');
  await act(async () => renderer.root.findAllByType(SelectablePill).find((pill) => pill.props.label === 'No schedule')!.props.onPress());
  await submit();
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ cadence: undefined, startValue: undefined }));
});
it('keeps entries after failure and prevents duplicate submissions while saving', async () => {
  let resolve!: (value: unknown) => void;
  mockCreate.mockImplementation(() => new Promise((done) => { resolve = done; }));
  await mount(); await fillGoal(); await submit(); await submit();
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(renderer.root.findByType(AppButton).props.busy).toBe(true);
  await act(async () => resolve(null));
  expect(mockBack).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(FormField)[0]!.props.value).toBe('Read books');
  expect(renderer.root.findByType(AppButton).props.busy).toBe(false);
});
it('waits for the edit row and preserves its exact deadline on save', async () => {
  mockId = 'existing'; mockLoading = true;
  await mount(); expect(renderer.root.findAllByType(FormField)).toHaveLength(0);
  mockGoals = [{ id: 'existing', title: 'Read', unit: 'books', target_value: 12,
    horizon_on: '2030-02-12', obstacle: '', if_then: '', direction: 'up',
    check_in_days: [], check_in_hijri: null, check_in_from: null,
  } as unknown as Goal];
  mockLoading = false;
  await act(async () => renderer.update(createElement(GoalComposerScreen)));
  await fill('Goal name', 'Read more'); await submit();
  expect(mockUpdate).toHaveBeenCalledWith('existing', expect.objectContaining({ title: 'Read more', horizon_on: '2030-02-12' }));
  expect(mockCreate).not.toHaveBeenCalled();
});
