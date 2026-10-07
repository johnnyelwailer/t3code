import type { T3TeamExplainerBlock } from "./model/t3team-explainer";

export type ExplainerBlockLayout = "main" | "aside" | "full";

/** Pictures lead on the left, proof (diffs, code) sits on the right, prose spans both. */
const DEFAULT_LAYOUT: Record<T3TeamExplainerBlock["type"], ExplainerBlockLayout> = {
  map: "main",
  sequence: "main",
  shape: "main",
  uiCompare: "main",
  image: "main",
  video: "main",
  widget: "main",
  diff: "aside",
  code: "aside",
  markdown: "full",
  callout: "full",
  keyValue: "full",
  table: "full",
  checklist: "full",
  unsupported: "full",
};

export function explainerBlockLayout(block: T3TeamExplainerBlock): ExplainerBlockLayout {
  return block.layout ?? DEFAULT_LAYOUT[block.type];
}

/** A block with its place in the step's reading order, which narrow players stack by. */
export interface ExplainerPlacedBlock {
  readonly block: T3TeamExplainerBlock;
  readonly order: number;
}

export type ExplainerLayoutRow =
  | { readonly kind: "full"; readonly item: ExplainerPlacedBlock }
  | {
      readonly kind: "band";
      readonly main: ReadonlyArray<ExplainerPlacedBlock>;
      readonly aside: ReadonlyArray<ExplainerPlacedBlock>;
    };

/**
 * The step's blocks as rows for a wide player: a `full` block is a row of its own; the
 * `main`/`aside` blocks between two full ones share a two-column band. Detail blocks are left
 * out until `showDetail`; `detailCount` says how many wait under "Show more".
 */
export function layoutExplainerBlocks(
  blocks: ReadonlyArray<T3TeamExplainerBlock>,
  showDetail: boolean,
) {
  const rows: ExplainerLayoutRow[] = [];
  let band: { main: ExplainerPlacedBlock[]; aside: ExplainerPlacedBlock[] } | null = null;
  let detailCount = 0;
  blocks.forEach((block, order) => {
    if (block.detail) detailCount += 1;
    if (block.detail && !showDetail) return;
    const layout = explainerBlockLayout(block);
    if (layout === "full") {
      band = null;
      rows.push({ kind: "full", item: { block, order } });
      return;
    }
    if (!band) {
      band = { main: [], aside: [] };
      rows.push({ kind: "band", ...band });
    }
    band[layout].push({ block, order });
  });
  return { rows, detailCount };
}
