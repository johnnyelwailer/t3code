/**
 * Journal-correctness tests: void result envelope round-trip, JournalSerializeError on
 * non-JSON results, JournalSchemaError when a recorded result no longer decodes against
 * the result schema, torn-tail recovery, and the unregistered-script dispatch guard.
 */

import { readFileSync, writeFileSync } from "node:fs";

import * as Schema from "effect/Schema";
import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  bigintResultWorkflow,
  cleanupRunsRoot,
  counters,
  demoTools,
  greetScript,
  resetCounters,
  runsRoot,
  twoTools,
  voidResultWorkflow,
} from "./t3work-sdk.engineFixtures.ts";
import {
  createDurableWorkflowRuntime,
  createStoreSink,
  defineTool,
  defineToolGroup,
  FsJournalStore,
  JournalSchemaError,
  JournalSerializeError,
  resumeWorkflow,
  startWorkflow,
  ToolHandlerCtx,
  WorkflowError,
} from "./t3work-sdk.index.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournal } from "./t3work-sdk.journalReader.ts";
import type { ScriptHandlerCtx } from "./t3work-sdk.types.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

describe("durable workflow engine — journal", () => {
  it("journals + replays a tool whose handler returns undefined (void result)", async () => {
    const { runId, result } = await startWorkflow(
      voidResultWorkflow,
      { note: "hello" },
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({ ok: true });
    expect(counters.noopCalls).toBe(1);
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(1);
    expect(journal.get(1)).toMatchObject({ seq: 1, kind: "tool", refId: "demo.noop" });
    expect(journal.get(1)?.result).toBeUndefined();
    const resumed = await resumeWorkflow(
      runId,
      voidResultWorkflow,
      { note: "hello" },
      { runsRoot, tools: demoTools },
    );
    expect(resumed.result).toEqual({ ok: true });
    expect(counters.noopCalls).toBe(1);
  });

  it("raises JournalSerializeError when a handler returns a non-JSON value", async () => {
    const error = await startWorkflow(
      bigintResultWorkflow,
      {},
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JournalSerializeError);
    const serr = error as JournalSerializeError;
    expect(serr.refId).toBe("demo.bigintResult");
    expect(serr.seq).toBe(1);
  });

  it("strict result mode rejects nested undefined and Map results before journaling", async () => {
    // A permissive (Schema.Unknown) result schema does not save a non-canonical-JSON value:
    // the strict result-mode check (25.2) throws JournalSerializeError before the write.
    const strictGroup = defineToolGroup({
      id: "demo.strict",
      label: "Strict-mode fixtures",
      description: "Tools whose results exercise the strict canonical-JSON result check.",
    });
    const undefTool = defineTool({
      id: "demo.undefProp",
      group: strictGroup,
      args: Schema.Struct({}),
      result: Schema.Unknown,
      handler: async () => ({ a: 1, b: undefined }),
    });
    const mapTool = defineTool({
      id: "demo.mapResult",
      group: strictGroup,
      args: Schema.Struct({}),
      result: Schema.Unknown,
      handler: async () => new Map([["a", 1]]) as unknown,
    });
    const ctx: ToolHandlerCtx = {
      runId: "strict",
      workspaceRoot: "/tmp",
      log: { info: () => {}, warn: () => {}, error: () => {} },
      fetch: async () => {
        throw new Error("fetch unsupported");
      },
      workspace: { readText: async () => "", writeText: async () => {}, exists: async () => false },
      callTool: <I, R>(_ref: never, _args: I): Promise<R> => {
        throw new Error("callTool unsupported");
      },
    };
    for (const tool of [undefTool, mapTool]) {
      const writer = createStoreSink(new FsJournalStore(runsRoot), `strict-${tool.id}`);
      try {
        const runtime = createDurableWorkflowRuntime({
          journal: new Map(),
          writer,
          toolCtx: ctx,
          scriptCtx: { ...ctx },
          scriptNames: new Map(),
          filePath: "/dev/null",
          nowIso: () => "1970-01-01T00:00:00.000Z",
        });
        const error = await runtime.callTool(tool, {}).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(JournalSerializeError);
      } finally {
        writer.dispose();
      }
    }
  });

  it("raises JournalSchemaError when a recorded result fails to re-decode", async () => {
    const { runId } = await startWorkflow(
      twoTools,
      { prId: "PR-schema" },
      { runsRoot, tools: demoTools },
    );
    const file = journalFilePath(runsRoot, runId);
    const lines = readFileSync(file, "utf8").trim().split("\n");
    const first = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    first["result"] = { v: { approved: 1, missing: true } };
    lines[0] = JSON.stringify(first);
    writeFileSync(file, `${lines.join("\n")}\n`);
    const error = await resumeWorkflow(
      runId,
      twoTools,
      { prId: "PR-schema" },
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(JournalSchemaError);
    const jse = error as JournalSchemaError;
    expect(jse.seq).toBe(1);
    expect(jse.kind).toBe("tool");
    expect(jse.refId).toBe("demo.approve");
    expect(counters.approveCalls).toBe(1);
  });

  it("drops a torn final journal line with a warning but rejects mid-file corruption", async () => {
    const { runId } = await startWorkflow(
      twoTools,
      { prId: "PR-torn" },
      { runsRoot, tools: demoTools },
    );
    const file = journalFilePath(runsRoot, runId);
    const fullText = readFileSync(file, "utf8");
    expect(fullText.trim().split("\n").length).toBe(2);
    expect(fullText.endsWith("\n")).toBe(true);
    const torn = '{"seq":3,"callId":"3:tool:demo.approve",';
    writeFileSync(file, `${fullText}${torn}`);
    const warnings: string[] = [];
    const journal = readJournal(file, (msg) => warnings.push(msg));
    expect(journal.size).toBe(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/torn final line/);
    expect(warnings[0]).toContain(file);
    const allLines = `${fullText}${torn}`.trim().split("\n");
    const corrupted = ["{not-json", ...allLines.slice(1)].join("\n");
    writeFileSync(file, `${corrupted}\n`);
    expect(() => readJournal(file, () => {})).toThrow(/Corrupt journal entry/);
  });

  it("throws WorkflowError when the runtime's callScript is reached with an unregistered ref", async () => {
    const toolCtx: ToolHandlerCtx = {
      runId: "test",
      workspaceRoot: "/tmp",
      log: { info: () => {}, warn: () => {}, error: () => {} },
      fetch: async () => {
        throw new Error("fetch unsupported");
      },
      workspace: { readText: async () => "", writeText: async () => {}, exists: async () => false },
      callTool: <I, R>(_ref: never, _args: I): Promise<R> => {
        throw new Error("callTool unsupported");
      },
    };
    const scriptCtx: ScriptHandlerCtx = { ...toolCtx };
    const writer = createStoreSink(new FsJournalStore(runsRoot), "unreg-script");
    try {
      // greetScript is real but the runtime's scriptNames map is empty — reaching
      // callScript with this ref simulates a start/resume registration mismatch.
      const runtime = createDurableWorkflowRuntime({
        journal: new Map(),
        writer,
        toolCtx,
        scriptCtx,
        scriptNames: new Map(),
        filePath: "/dev/null",
        nowIso: () => "1970-01-01T00:00:00.000Z",
      });
      const error = await runtime.callScript(greetScript, { name: "x" }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WorkflowError);
      expect((error as WorkflowError).message).toMatch(/not registered/i);
    } finally {
      writer.dispose();
    }
  });
});
