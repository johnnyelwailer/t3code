import { describe, expect, it } from "vite-plus/test";

import { IMPLEMENTED_T3WORK_TOOL_CATALOG } from "./t3workToolCatalogImplemented.ts";

describe("t3work widget authoring guidance", () => {
  it("requires themed, responsive, compact widgets with accessible inline icons", () => {
    const tool = IMPLEMENTED_T3WORK_TOOL_CATALOG["t3work.widget.show"];
    const schemaText = JSON.stringify(tool.inputSchema);

    expect(schemaText).toContain("var(--background)");
    expect(schemaText).toContain("width:100%");
    expect(schemaText).toContain("progressive disclosure");
    expect(schemaText).toContain("chat owns scrolling");
    expect(schemaText).toContain("inline SVG icons using currentColor");
    expect(schemaText).toContain("16px or 20px");
    expect(schemaText).toContain("do not use emoji or Unicode pictograms except as a fallback");
  });
});
