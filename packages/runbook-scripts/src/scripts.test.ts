import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { defineScript, executeScriptHandler, type ScriptHandlerContext } from "./index.ts";

describe("@runbook/scripts", () => {
  it("keeps replay policy and schema validation in the reusable package", async () => {
    let dispatched = false;
    const ref = defineScript({
      inputs: Schema.Struct({ name: Schema.String }),
      outputs: Schema.Struct({ greeting: Schema.String }),
      replay: "never" as const,
      handler: async (args: { readonly name: string }, _ctx: ScriptHandlerContext) => ({
        greeting: `Hi ${args.name}`,
      }),
      dispatch: async (target, args) => {
        dispatched = target.replay === "never";
        return await executeScriptHandler(target, args, {
          runId: "run-1",
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

    expect(await ref({ name: "Ada" })).toEqual({ greeting: "Hi Ada" });
    expect(dispatched).toBe(true);
  });
});
