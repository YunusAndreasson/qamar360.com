import { Redirect } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';

// Root entry. expo-router needs a leaf for "/" — without it, launching at
// `qamar360:///` lands on the "Unmatched Route" screen. Send "/" to the first
// real screen based on auth; the Stack.Protected guards in _layout keep the
// groups themselves protected.
export default function Index() {
  const { session, initialized } = useAuth();
  if (!initialized) return null;
  return <Redirect href={session ? '/habits' : '/sign-in'} />;
}
