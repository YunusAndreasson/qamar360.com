import { LunarUpdatesSheet } from '@/components/lunar-updates-sheet';

/** The lunar updates explained before the OS asks, from the Settings switch (see {@link LunarUpdatesSheet}). */
export default function LunarUpdatesScreen() {
  return <LunarUpdatesSheet source="settings" />;
}
