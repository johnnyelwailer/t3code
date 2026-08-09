/**
 * Every t3team MCP tool must advertise an OBJECT inputSchema.
 *
 * The failure this guards is not local to one tool: MCP clients reject a tool whose inputSchema is
 * not an object when they read `tools/list`, and that drops the WHOLE toolkit for that client. So a
 * single malformed schema silently removes every t3team tool from the agent's reach.
 *
 * It regressed exactly once already. `t3team_recipe_list` takes no arguments and was declared with
 * `parameters: Schema.Struct({})`; an empty TS object type means "any non-null", which effect
 * renders as `{anyOf:[{type:"object"},{type:"array"}]}`. Omitting `parameters` instead picks up
 * `Tool.EmptyParams`, which renders as `{type:"object",additionalProperties:false}`.
 *
 * Asserted over the whole module rather than a hand-listed set, so a tool added later is covered
 * without anyone remembering to add it here.
 */
import { describe, expect, it } from "vite-plus/test";
import * as Tool from "effect/unstable/ai/Tool";

import * as t3teamTools from "./tools.ts";

const exportedTools = Object.entries(t3teamTools).filter(([name]) => name.endsWith("Tool"));

describe("t3team MCP tool input schemas", () => {
  it("exports tools to check", () => {
    expect(exportedTools.length).toBeGreaterThan(10);
  });

  for (const [exportName, tool] of exportedTools) {
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
