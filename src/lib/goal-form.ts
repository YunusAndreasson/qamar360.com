/** Parse a non-negative amount without silently removing mistyped characters. */
export function parseGoalNumber(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
