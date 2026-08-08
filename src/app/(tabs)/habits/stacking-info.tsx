import { GuideScreen } from '@/components/guide-screen';
import { STACKING_GUIDE } from '@/constants/guides';

/** The habit-stacking guide, pushed from the "New stack" form (see {@link GuideScreen}). */
export default function StackingInfoScreen() {
  return <GuideScreen guide={STACKING_GUIDE} />;
}
