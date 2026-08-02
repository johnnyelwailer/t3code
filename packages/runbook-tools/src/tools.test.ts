import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  createToolGroup,
  defineTool,
  defineToolGroup,
  executeToolHandler,
  type ToolHandlerContext,
} from "./index.ts";

describe("@runbook/tools", () => {
  it("creates typed refs with injected dispatch and schema validation", async () => {
    const group = defineToolGroup({ id: "demo.read", label: "Demo", description: "Tests" });
    let dispatched = "";
    const ref = defineTool({
      id: "demo.lookup" as const,
      group,
      args: Schema.Struct({ id: Schema.String }),
      result: Schema.Struct({ found: Schema.Boolean }),
      handler: async (args: { readonly id: string }, _ctx: ToolHandlerContext) => ({
        found: args.id.length > 0,
      }),
      dispatch: async (target, args) => {
        dispatched = target.id;
        return await executeToolHandler(target, args, {
          workspaceRoot: "/tmp",
          log: { info: () => {}, warn: () => {}, error: () => {} },
          fetch: async () => new Response(),
          workspace: {
            readText: async () => "",
            writeText: async () => {},
            exists: async () => false,
          },
          callTool: async () => undefined,
        });
      },
    });

    expect(await ref({ id: "PR-1" })).toEqual({ found: true });
    expect(dispatched).toBe("demo.lookup");
  });
});
