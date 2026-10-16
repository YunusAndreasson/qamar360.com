import { afterEach, beforeAll, beforeEach, expect, it, jest } from '@jest/globals';
import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

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
// The composer commits from its nav bar, like every editor; the test reads that bar's options.
let mockOptions: { headerRight?: () => { props: { onSave: () => void; label: string; busy: boolean } } } = {};
jest.mock('expo-router', () => ({
  Stack: { Screen: ({ options }: { options: typeof mockOptions }) => { mockOptions = options; return null; } },
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
jest.mock('@/components/empty-state', () => ({ EmptyState: 'EmptyState' }));
jest.mock('@/components/skeleton', () => ({ Skeleton: 'Skeleton' }));
// The real row owns its open state; here it is open exactly when asked to start open.
jest.mock('@/components/disclosure-row', () => ({
  DisclosureRow: ({ initiallyExpanded, children }: { initiallyExpanded?: boolean; children: unknown }) =>
    initiallyExpanded ? children : null,
}));
jest.mock('@/components/selectable-pill', () => ({ SelectablePill: 'SelectablePill' }));
jest.mock('@/components/weekday-picker', () => ({ WeekdayPicker: 'WeekdayPicker' }));
jest.mock('@/components/toast', () => ({ useToast: () => ({ show: jest.fn() }) }));
jest.mock('@/lib/haptics', () => ({ haptics: { added: jest.fn(), selection: jest.fn() } }));

let renderer: ReactTestRenderer;
beforeAll(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); });
beforeEach(() => {
  jest.clearAllMocks(); mockId = undefined; mockGoals = []; mockLoading = false; mockOptions = {};
  mockCreate.mockResolvedValue({ id: 'created' }); mockUpdate.mockResolvedValue(true); mockCheckIn.mockResolvedValue(true);
});
afterEach(async () => { await act(async () => renderer?.unmount()); });
async function mount() { await act(async () => { renderer = create(createElement(GoalComposerScreen)); }); }
async function fill(label: string, value: string) {
  await act(async () => renderer.root.findAllByType(FormField).find((field) => field.props.label === label)!.props.onChangeText(value));
}
const saveButton = () => mockOptions.headerRight!().props;
async function submit() { await act(async () => saveButton().onSave()); }
async function fillGoal() {
  await fill('Goal name', 'Read books'); await fill('Target amount', '12,5'); await fill('Unit', 'books');
  await fill('Current amount (books)', '0');
}

it('opens directly in the goal form with optional planning collapsed', async () => {
  await mount();
  expect(renderer.root.findAllByType(FormField).map((field) => field.props.label)).toEqual([
    'Goal name', 'Target amount', 'Unit', 'Current amount',
  ]);
  expect(saveButton().label).toBe('Create');
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
  expect(saveButton().busy).toBe(true);
  await act(async () => resolve(null));
  expect(mockBack).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(FormField)[0]!.props.value).toBe('Read books');
  expect(saveButton().busy).toBe(false);
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
it('opens the obstacle plan when the goal being edited already has one', async () => {
  mockId = 'planned';
  mockGoals = [{ id: 'planned', title: 'Read', unit: 'books', target_value: 12,
    horizon_on: '2030-02-12', obstacle: 'Too tired', if_then: 'One page', direction: 'up',
    check_in_days: [], check_in_hijri: null, check_in_from: null,
  } as unknown as Goal];
  await mount();
  const labels = renderer.root.findAllByType(FormField).map((field) => field.props.label);
  expect(labels).toEqual(expect.arrayContaining(['Obstacle', 'Plan']));
});
