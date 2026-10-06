/**
 * The digest's lane grid, built from the lanes that actually have content so an empty side lane
 * never reserves a column. Breakpoints are container queries on the digest root
 * (`@container/digest`), not viewport ones: the pane is the viewport minus the sidebar, so a
 * viewport `xl` would split a ~1000px pane into lanes too narrow for the item rows.
 */
export type DigestLaneLayout = {
  readonly gridClassName: string;
  readonly showSide: boolean;
  readonly showMain: boolean;
};

const BASE = "grid grid-cols-1 gap-y-8";
// 72rem (1152px): the 2fr side lane is then ~320px, the narrowest an item row stays readable at.
const TWO_LANES = `${BASE} gap-x-6 @xl/digest:gap-x-10 @6xl/digest:grid-cols-[minmax(16rem,2fr)_minmax(0,5fr)]`;

export function digestLaneLayout(counts: {
  readonly side: number;
  readonly main: number;
}): DigestLaneLayout {
  const showSide = counts.side > 0;
  const showMain = counts.main > 0;
  return {
    gridClassName: showSide && showMain ? TWO_LANES : BASE,
    showSide,
    showMain,
  };
}
