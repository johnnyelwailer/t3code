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
    expect(schemaText).toContain("currentColor");
    expect(schemaText).toContain("16px or 20px");
    expect(schemaText).toContain("instead of emoji or Unicode pictograms");
    expect(schemaText).toContain("never depend on an external icon library");
  });

  it("names the sanctioned icon sprite and the status tokens that replace emoji glyphs", () => {
    const tool = IMPLEMENTED_T3WORK_TOOL_CATALOG["t3work.widget.show"];
    const schemaText = JSON.stringify(tool.inputSchema);

    // Authors must be told HOW to render a real icon, not only that emoji are forbidden.
    expect(schemaText).toContain("t3w-icon");
    expect(schemaText).toContain("#t3w-icon-NAME");
    expect(schemaText).toContain("t3w-icon-lg");
    for (const name of ["circle-check", "triangle-alert", "circle-x", "info", "clock"]) {
      expect(schemaText).toContain(name);
    }
    // Status colour tokens, so a "pass/warn/fail" icon is theme-driven in light and dark.
    expect(schemaText).toContain("var(--success)");
    expect(schemaText).toContain("var(--warning)");
    expect(schemaText).toContain("var(--info)");
    // Description surface too — some clients only show the tool-level text.
    expect(tool.description).toContain("t3w-icon");
  });
});
