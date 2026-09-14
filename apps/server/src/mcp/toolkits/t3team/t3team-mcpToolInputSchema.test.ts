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
