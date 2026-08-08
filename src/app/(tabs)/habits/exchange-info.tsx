import { GuideScreen } from '@/components/guide-screen';
import { EXCHANGE_GUIDE } from '@/constants/guides';

/** The exchange guide, pushed from the "New exchange" form (see {@link GuideScreen}). */
export default function ExchangeInfoScreen() {
  return <GuideScreen guide={EXCHANGE_GUIDE} />;
}
