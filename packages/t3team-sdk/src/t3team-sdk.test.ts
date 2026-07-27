import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import type * as ValidWorkflowModule from "./__fixtures__/t3team-sdk.valid.workflow.ts";
import {
  buildToolTree,
  defineScript,
  defineTool,
  defineToolGroup,
  defineWorkflow,
  executeRegisteredTool,
  executeScriptHandler,
  type FetchLike,
  type ScriptHandlerCtx,
  type ScriptRef,
  type ToolHandlerCtx,
  type ToolRef,
  type ToolWorkspace,
  type WorkflowRef,
  withWorkflowRuntime,
} from "./t3team-sdk.index.ts";
import { renameThreadTool } from "./tools/t3team-sdk.t3team.ts";
import { validateRecipeTool } from "./tools/t3team-sdk.t3teamRecipes.ts";

let idCounter = 0;

const unsupportedFetch: FetchLike = async () => {
  throw new Error("Fetch is not available in this test context.");
};

const noopLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
} as const;

const noopWorkspace: ToolWorkspace = {
  readText: async () => "",
  writeText: async () => {},
  exists: async () => false,
};

const unsupportedCallTool: ToolHandlerCtx["callTool"] = async <I, R>(
  _ref: ToolRef<I, R>,
  _args: I,
): Promise<R> => {
  throw new Error("Nested tool calls are not expected in this test.");
};

const unsupportedCallScript = async <I, O>(_ref: ScriptRef<I, O>, _args: I): Promise<O> => {
  throw new Error("Script dispatch was not expected in this test.");
};

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}.${idCounter}`;
}

function createToolCtx(overrides: Partial<ToolHandlerCtx> = {}): ToolHandlerCtx {
  return {
    workspaceRoot: "/workspace/project",
    log: noopLog,
    fetch: unsupportedFetch,
    workspace: noopWorkspace,
    callTool: unsupportedCallTool,
    ...overrides,
  };
}

function createScriptCtx(overrides: Partial<ScriptHandlerCtx> = {}): ScriptHandlerCtx {
  return {
    runId: "run-1",
    workspaceRoot: "/workspace/project",
    log: noopLog,
    fetch: unsupportedFetch,
    workspace: noopWorkspace,
    callTool: unsupportedCallTool,
    ...overrides,
  };
}

describe("workflow-sdk", () => {
  it("defineTool returns a typed callable that dispatches through the workflow runtime", async () => {
    const group = defineToolGroup({
      id: nextId("sdk_test.tools"),
      label: "SDK test tools",
      description: "Test-only group for workflow-sdk dispatch coverage.",
    });

    const mergeTool = defineTool({
      id: "sdk_test.pull_request.merge",
      group,
      args: Schema.Struct({ id: Schema.String }),
      result: Schema.Struct({ merged: Schema.Boolean }),
      handler: async () => {
        throw new Error("Handler should not execute when a runtime dispatcher is installed.");
      },
    });

    const toolTree = buildToolTree([mergeTool] as const);
    const callable: (args: { readonly id: string }) => Promise<{ readonly merged: boolean }> =
      toolTree.sdkTest.pullRequest.merge;
    const dispatched: Array<{ readonly id: string; readonly args: unknown }> = [];

    const result = await withWorkflowRuntime(
      {
        callTool: async (ref, args) => {
          dispatched.push({ id: ref.id, args });
          return { merged: true } as typeof mergeTool extends ToolRef<unknown, infer Result>
            ? Result
            : never;
        },
        callScript: unsupportedCallScript,
      },
      () => callable({ id: "pr-42" }),
    );

    expect(result).toEqual({ merged: true });
    expect(dispatched).toEqual([{ id: mergeTool.id, args: { id: "pr-42" } }]);
  });

  it("throws on duplicate tool group ids", () => {
    const id = nextId("sdk_test.duplicate_group");

    defineToolGroup({
      id,
      label: "First",
      description: "The first registration should succeed.",
    });

    expect(() =>
      defineToolGroup({
        id,
        label: "Second",
        description: "The second registration should fail.",
      }),
    ).toThrow(`Duplicate tool group registration '${id}'.`);
  });

  it("validates script inputs before the handler runs", async () => {
    let handlerRuns = 0;

    const script = defineScript({
      inputs: Schema.Struct({ count: Schema.Number }),
      outputs: Schema.Struct({ ok: Schema.Boolean }),
      handler: async () => {
        handlerRuns += 1;
        return { ok: true };
      },
    });

    await expect(
      executeScriptHandler(script, { count: "nope" }, createScriptCtx()),
    ).rejects.toThrow("Invalid arguments for script");
    expect(handlerRuns).toBe(0);
  });

  it("validates workflow file paths when defining refs", () => {
    const ref = defineWorkflow<typeof ValidWorkflowModule>(
      "./__fixtures__/t3team-sdk.valid.workflow.ts",
    );
    const typedRef: WorkflowRef<{ readonly owner: string }, { readonly merged: boolean }> = ref;

    expect(typedRef.path).toBe("./__fixtures__/t3team-sdk.valid.workflow.ts");
    expect(typedRef.absolutePath.endsWith("t3team-sdk.valid.workflow.ts")).toBe(true);
    expect(() =>
      defineWorkflow<typeof ValidWorkflowModule>("./__fixtures__/missing.workflow.ts"),
    ).toThrow("does not resolve to an existing file");
  });

  it("executes the migrated rename tool through the registration map", async () => {
    const result = await executeRegisteredTool(
      renameThreadTool.id,
      { title: "  Updated title  " },
      createToolCtx({
        threadId: "thread-1",
        t3team: {
          renameThread: async ({ title }) => ({ ok: true, title, threadId: "thread-1" }),
        },
      }),
    );

    expect(result).toEqual({ ok: true, title: "Updated title", threadId: "thread-1" });
  });

  it("t3team.recipe.validate rejects when neither 'path' nor 'source' is given", async () => {
    await expect(
      executeRegisteredTool(
        validateRecipeTool.id,
        {},
        createToolCtx({
          t3team: {
            validateRecipe: async () => ({ ok: true, errors: [] }),
          },
        }),
      ),
    ).rejects.toThrow(
      "t3team.recipe.validate requires exactly one of 'path' (workspace .workflow.ts or recipe directory) or 'source' (inline workflow TypeScript).",
    );
  });

  it("t3team.recipe.validate rejects when both 'path' and 'source' are given", async () => {
    await expect(
      executeRegisteredTool(
        validateRecipeTool.id,
        { path: "./foo.workflow.ts", source: "export const meta = {};" },
        createToolCtx({
          t3team: {
            validateRecipe: async () => ({ ok: true, errors: [] }),
          },
        }),
      ),
    ).rejects.toThrow(
      "t3team.recipe.validate requires exactly one of 'path' (workspace .workflow.ts or recipe directory) or 'source' (inline workflow TypeScript).",
    );
  });

  it("t3team.recipe.validate passes only 'source' through to the client when source-only", async () => {
    const received: Array<{ readonly path?: string; readonly source?: string }> = [];
    const result = await executeRegisteredTool(
      validateRecipeTool.id,
      { source: "export const meta = { name: 'x' };" },
      createToolCtx({
        t3team: {
          validateRecipe: async (input) => {
            received.push(input);
            return { ok: true, errors: [] };
          },
        },
      }),
    );

    expect(received).toEqual([{ source: "export const meta = { name: 'x' };" }]);
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("t3team.recipe.validate passes only 'path' through to the client when path-only", async () => {
    const received: Array<{ readonly path?: string; readonly source?: string }> = [];
    const result = await executeRegisteredTool(
      validateRecipeTool.id,
      { path: "./foo.workflow.ts" },
      createToolCtx({
        t3team: {
          validateRecipe: async (input) => {
            received.push(input);
            return { ok: true, errors: [] };
          },
        },
      }),
    );

    expect(received).toEqual([{ path: "./foo.workflow.ts" }]);
    expect(result).toEqual({ ok: true, errors: [] });
  });
});
