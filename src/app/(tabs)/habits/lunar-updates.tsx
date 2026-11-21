import { LunarUpdatesSheet } from '@/components/lunar-updates-sheet';

/**
 * The lunar updates offered once, unasked, as the first closed day's celebration fades (see
 * `DayCompleteProvider`). Registered under Today so the offer never switches tabs.
 */
export default function LunarUpdatesOfferScreen() {
  return <LunarUpdatesSheet source="first_day_completed" />;
}
