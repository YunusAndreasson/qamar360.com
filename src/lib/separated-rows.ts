/**
 * How a grouped-list card lays its rows out — resolved as data, so the six cards that share the
 * idiom can't each hand-roll it slightly differently.
 *
 * The idiom itself is the iOS inset-grouped list: rows stacked in one surface, each pair divided
 * by an inset hairline, and **no rule above the first or below the last** — those edges are the
 * card's own. Written by hand that is a `map` with an `index > 0 &&` inside it, which is exactly
 * the sort of thing that reads as correct in all six places while one of them quietly isn't.
 *
 * Kept here, apart from the component that renders it, because the interesting part is a rule
 * about a list and not a rule about views — and because jest here matches `src/**\/*.test.ts`
 * only, so a rule living in a `.tsx` would have no test at all. (The same split as
 * `lib/loose-row.ts` beside `components/loose-row.tsx`.)
 */

import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

/** One row of a grouped card: the child, its identity, and whether a rule precedes it. */
export type SeparatedRow = {
  /**
   * The child's own key, which `Children.toArray` derives from the key the caller wrote (`.$id`)
   * or from the position for one written inline (`.0`). Either way a row keeps its React instance
   * — and any state inside it, e.g. a Discover row's expanded detail — when the list is filtered
   * or reordered around it, instead of being recycled into a sibling.
   */
  key: string;
  node: ReactElement;
  /** A rule sits above this row. True for every row but the first. */
  separated: boolean;
};

/**
 * Resolve a card's children into its rows.
 *
 * **Only elements become rows.** `Children.toArray` drops `null`, `undefined` and `false`, which
 * is what lets a conditional row be written inline (`canDelete && <Row/>`) without leaving a rule
 * hanging over nothing — but it *keeps* `0`, `''` and `NaN`, so the other classic conditional
 * (`items.length && <Row/>`, which yields a bare `0` on an empty list) would otherwise become a
 * row of its own: an inset rule over a value React Native then refuses to render outside a
 * `<Text>`. Anything that is not an element is dropped here, before the first-row test — so the
 * rule is about the rows that actually render, not about the expressions that produced them.
 */
export function separatedRows(children: ReactNode): SeparatedRow[] {
  return Children.toArray(children)
    .filter((node): node is ReactElement => isValidElement(node))
    .map((node, index) => ({
      // Non-null for anything `Children.toArray` returns — it keys every element it hands back.
      key: String(node.key),
      node,
      separated: index > 0,
    }));
}
