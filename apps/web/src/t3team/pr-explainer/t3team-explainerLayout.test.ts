import { describe, expect, it } from "vite-plus/test";

import type { T3TeamExplainerBlock } from "./model/t3team-explainer";
import { layoutExplainerBlocks } from "./t3team-explainerLayout";
import { explainerStepLabel } from "./t3team-explainerStepKind";

const md = (id: string, extra: Partial<T3TeamExplainerBlock> = {}) =>
  ({ id, type: "markdown", text: id, ...extra }) as T3TeamExplainerBlock;
const map = (id: string) => ({ id, type: "map" }) as T3TeamExplainerBlock;
const code = (id: string) => ({ id, type: "code", code: "" }) as T3TeamExplainerBlock;

describe("layoutExplainerBlocks", () => {
  it("puts pictures left and proof right, with full blocks between bands", () => {
    const { rows } = layoutExplainerBlocks([md("intro"), map("m"), code("c"), md("outro")], false);
    expect(
      rows.map((row) =>
        row.kind === "full"
          ? row.item.block.id
          : [row.main.map((item) => item.block.id), row.aside.map((item) => item.block.id)],
      ),
    ).toEqual(["intro", [["m"], ["c"]], "outro"]);
  });

  it("honours an explicit layout and keeps reading order for narrow stacking", () => {
    const { rows } = layoutExplainerBlocks([code("c"), md("note", { layout: "main" })], false);
    expect(rows[0]).toMatchObject({
      kind: "band",
      main: [{ order: 1 }],
      aside: [{ order: 0 }],
    });
  });

  it("folds detail blocks until asked", () => {
    const blocks = [md("a"), md("b", { detail: true })];
    expect(layoutExplainerBlocks(blocks, false)).toMatchObject({ detailCount: 1 });
    expect(layoutExplainerBlocks(blocks, false).rows).toHaveLength(1);
    expect(layoutExplainerBlocks(blocks, true).rows).toHaveLength(2);
  });
});

describe("explainerStepLabel", () => {
  it("prefers the step's own label, then a caption lead-in, then its first words", () => {
    expect(explainerStepLabel({ label: "New cache", caption: "x" })).toBe("New cache");
    expect(explainerStepLabel({ caption: "Check: the key has no viewer." })).toBe("Check");
    expect(explainerStepLabel({ caption: "The loader reads the cache." })).toBe("Loader reads");
  });
});
