/**
 * The spans the horizon is chosen from, in **lunar** months, and every one of them is `12N − 1`:
 * the current month counts toward the goal, so "1 year" is this month plus eleven more. A goal is
 * set in years rather than on a date wheel — twenty years of one is unusable — and this app counts
 * in lunar months anyway, so the label's "years" are lunar years throughout. (20 years was briefly
 * 247, the count of lunar months in twenty *solar* years, which made that one span mean something
 * different from the other five and put the by-when eight months past its own label.)
 */
export const HORIZON_SPANS: { months: number; label: string }[] = [
  { months: 5, label: '6 months' },
  { months: 11, label: '1 year' },
  { months: 35, label: '3 years' },
  { months: 59, label: '5 years' },
  { months: 119, label: '10 years' },
  { months: 239, label: '20 years' },
];
