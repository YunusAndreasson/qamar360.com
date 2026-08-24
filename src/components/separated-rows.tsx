import { View } from 'react-native';

import { RowSeparator } from '@/components/row-separator';
import { separatedRows } from '@/lib/separated-rows';

import type { ReactNode } from 'react';

/**
 * A card's rows, divided by the inset rule — the grouped-list idiom, in one place.
 *
 * It was written by hand six times: the settings card, a form sheet's actions, the three sections
 * of the day, and a stack card's own sequence. Each spelled the same `index > 0 &&
 * <RowSeparator/>` inside its own map, which is a rule that reads as obviously right in every copy
 * while nothing checks that all six agree. The rule itself lives in {@link separatedRows}, where
 * it has a test; this is the view that paints it.
 *
 * Each row keeps a keyed wrapper `View` rather than a bare `Fragment`. That is deliberate: five of
 * the six sites already had one, one of them holds a drag target
 * ({@link import('@/components/habit-drag').DraggableMemberRow}), and quietly changing the view
 * tree under a drag engine that measures frames is not a refactor's business.
 */
export function SeparatedRows({ children, trailing }: {
  children: ReactNode;
  /**
   * A closing row — a card's quiet footer door ("Manage stack", the anchoring offer, the `＋ Add`
   * composer). Apart from `children` because it is not one of the things the list is *of*: it
   * survives when the list is empty, which is what lets a card be nothing but its footer (the
   * empty day's to-do composer) or its one invitation.
   *
   * It takes the SAME rule as any other row — it is simply the row after the last one — so it
   * carries a rule when something precedes it and none when it stands alone.
   */
  trailing?: ReactNode;
}) {
  const rows = separatedRows(children);
  return (
    <>
      {rows.map((row) => (
        <View key={row.key}>
          {row.separated ? <RowSeparator /> : null}
          {row.node}
        </View>
      ))}
      {trailing ? (
        <>
          {/* `rows.length > 0` is `index > 0` for the row after the last — the same test, applied
              to one more row, rather than a second rule that could disagree with the first. */}
          {rows.length > 0 ? <RowSeparator /> : null}
          {trailing}
        </>
      ) : null}
    </>
  );
}
