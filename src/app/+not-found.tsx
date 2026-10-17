import { Redirect } from 'expo-router';

// A link to a route that doesn't exist (an old notification, a mistyped URL) lands on the root
// entry, which sends you on by auth, rather than on expo-router's "Unmatched Route" screen.
export default function NotFound() {
  return <Redirect href="/" />;
}
