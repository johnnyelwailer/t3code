/**
 * Every MCP tool this server serves must advertise an OBJECT inputSchema.
 *
 * The failure this guards is not local to one tool: MCP clients validate the WHOLE `tools/list`
 * response, rejecting any tool whose inputSchema is not a literal `{type:"object"}`, and that drops
 * every tool the server serves for that client — across toolkits. So a single malformed schema
 * silently removes every t3team AND every preview tool from the agent's reach.
 *
 * It has now regressed twice, the same way both times:
 *   - `t3team_recipe_list` — caught before shipping.
 *   - `t3team_task_list` (#209) — shipped. Every Nexplore agent lost all 22 t3team_* and all 14
 *     preview_* tools, silently, for a day. This test was RED on main and the PR merged anyway.
 *
 * Both were `parameters: Schema.Struct({})`; an empty TS object type means "any non-null", which
 * effect renders as `{anyOf:[{type:"object"},{type:"array"}]}`. Omitting `parameters` instead picks
 * up `Tool.EmptyParams`, which renders as `{type:"object",additionalProperties:false}`.
 *
 * Asserted over whole modules rather than hand-listed sets, so a tool added later is covered
 * without anyone remembering to add it here. The preview toolkit is included because it rides the
 * same `tools/list` response — it was collateral damage in #209 while having no guard of its own.
 */
import { describe, expect, it } from "vite-plus/test";
import * as Tool from "effect/unstable/ai/Tool";

import * as previewTools from "../preview/tools.ts";
import * as t3teamTools from "./tools.ts";

const exportedTools = (module: Record<string, unknown>) =>
  Object.entries(module).filter(([name]) => name.endsWith("Tool"));

const toolkits = [
  { label: "t3team", tools: exportedTools(t3teamTools), atLeast: 10 },
  { label: "preview", tools: exportedTools(previewTools), atLeast: 10 },
];

for (const { label, tools, atLeast } of toolkits) {
  describe(`${label} MCP tool input schemas`, () => {
    it("exports tools to check", () => {
      expect(tools.length).toBeGreaterThan(atLeast);
    });

    for (const [exportName, tool] of tools) {
      it(`${exportName} advertises an object inputSchema`, () => {
        const schema = Tool.getJsonSchema(tool as never) as Record<string, unknown>;
        // Top level only: `anyOf` INSIDE a property is just how an optional union renders and is fine.
        expect(
          schema.anyOf,
          `${exportName} inputSchema must not be a top-level union`,
        ).toBeUndefined();
        expect(schema.type).toBe("object");
      });
    }
  });
}

/**
 * The `t3team_show_widget` model-facing contract must stay in lockstep with the documented
 * guidance (packages/project-context/src/t3teamWidgetGuidance.ts).
 *
 * This regressed silently once: the guidance constant and the catalog snapshot both carried the
 * theme-token + sprite-icon contract, but the live Tool.make schema shipped with bare
 * `Schema.String` properties and a description with no theming rules at all — so agents
 * hard-coded hex palettes and widgets rendered as dark-on-light mush (or vice versa). The
 * catalog test (`t3teamWidgetGuidance.test.ts`) only asserts the catalog snapshot, so the live
 * surface drifted with every CI run green. These assertions check the LIVE JSON schema the
 * MCP server advertises.
 */
describe("t3team_show_widget model-facing contract", () => {
  const tool = t3teamTools.T3TeamShowWidgetTool;
  const schema = Tool.getJsonSchema(tool as never) as Record<string, unknown>;
  const schemaText = JSON.stringify(schema);

  it("advertises the theme-token, icon-sprite, and layout contract in the tool description", () => {
    expect(tool.description).toContain("theme variables");
    expect(tool.description).toContain("t3w-icon");
  });

  it("carries the full authoring guidance on the widget_code property", () => {
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const widgetCode = properties.widget_code;
    expect(widgetCode?.description).toBeDefined();
    const description = String(widgetCode?.description ?? "");
    expect(description).toContain("var(--background)");
    expect(description).toContain("var(--success)");
    expect(description).toContain("Never hard-code light or dark palette colors");
    expect(description).toContain("#t3w-icon-NAME");
    expect(description).toContain("sendPrompt");
  });

  it("keeps the schema text consistent with the documented contract", () => {
    expect(schemaText).toContain("width:100%");
    expect(schemaText).toContain("progressive disclosure");
    expect(schemaText).toContain("chat owns scrolling");
    expect(schemaText).toContain("currentColor");
  });
});
