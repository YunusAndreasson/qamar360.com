import { GuideScreen } from '@/components/guide-screen';
import { STACKING_GUIDE } from '@/constants/guides';

/** The habit-stacking guide, pushed from Settings → Guide (see {@link GuideScreen}). */
export default function StackingInfoScreen() {
  return <GuideScreen guide={STACKING_GUIDE} />;
}
