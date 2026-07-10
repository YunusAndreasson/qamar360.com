/**
 * A client-minted RFC-4122 v4 UUID. It lets us insert a row with an id we already know, instead of
 * round-tripping to read back a server-generated one — so an optimistic row keeps a *stable* id and
 * never has to swap a placeholder for the real one (a swap would remount the row and re-fire its
 * entrance animation). `habit_stacks.id` is a `uuid` column, so a well-formed v4 satisfies it.
 *
 * Math.random-based on purpose: this is a database row id, not a secret. React Native's Hermes has
 * no `crypto.randomUUID`, and the collision odds for v4 are negligible for our volumes.
 */
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
