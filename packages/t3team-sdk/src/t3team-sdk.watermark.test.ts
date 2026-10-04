/**
 * `watermark` through the REAL SDK surface: a `.workflow.ts` body importing `watermark` and a
 * built-in signal source from `@t3team/sdk`, driven by `startWorkflow`/`resumeWorkflow` over the
 * filesystem journal — whose checkpoint-aware replay window is what every resume reads.
 *
 *   1. END TO END: each delivered work-item update advances the cursor; each resume after the
 *      first boundary re-drives from the latest boundary (bounded materialization) and reads
 *      strictly after the durable cursor; a replay of the completed run re-fires nothing.
 *   2. CAPABILITY GATE: `watermark(key)` without `source:<key>` → PermissionDeniedError.
 *   3. SUB-WORKFLOW GUARD: `watermark()` in a child → SubWorkflowCheckpointError.
 *   4. STATIC SCAN: both `getSignalSource(<built-in>)` and `watermark("<key>")` call sites are
 *      reported when their `source:<name>` capability is missing.
 */

import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as NoCapability from "./__fixtures__/t3team-sdk.watermarkNoCapability.workflow.ts";
import type * as SubGuardParent from "./__fixtures__/t3team-sdk.subWatermarkGuardParent.workflow.ts";
import type * as WorkItem from "./__fixtures__/t3team-sdk.watermarkWorkItem.workflow.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  defineWorkflow,
  FsJournalStore,
  PermissionDeniedError,
  resumeWorkflow,
  startWorkflow,
  SubWorkflowCheckpointError,
  type SuspendedResult,
  type WatermarkState,
  type WorkflowRunResult,
} from "./t3team-sdk.index.ts";
import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";

const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-watermark-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const workItem = defineWorkflow<typeof WorkItem>(
  "./__fixtures__/t3team-sdk.watermarkWorkItem.workflow.ts",
);
const noCapability = defineWorkflow<typeof NoCapability>(
  "./__fixtures__/t3team-sdk.watermarkNoCapability.workflow.ts",
);
const subGuardParent = defineWorkflow<typeof SubGuardParent>(
  "./__fixtures__/t3team-sdk.subWatermarkGuardParent.workflow.ts",
);

const isSuspended = <O>(r: WorkflowRunResult<O> | SuspendedResult): r is SuspendedResult =>
  "suspended" in r;

const update = (updatedAt: string) => ({
  provider: "jira",
  issueKey: "ABC-1",
  title: "Rotate the signing key",
  updatedAt,
});

describe("watermark over a built-in signal source (end to end)", () => {
  it("advances a durable cursor per delivery and resumes strictly after it", async () => {
    const broker = createMockBroker(() => ({ kind: "defer" }));
    const base = { runsRoot, tools: [], broker, runId: "run-watermark-e2e" } as const;
    const args = { updates: 3 };
    const store = new FsJournalStore(runsRoot);

    let result: WorkflowRunResult<unknown> | SuspendedResult = await startWorkflow(
      workItem,
      args,
      base,
    );
    const stamps = ["2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z", "2026-09-03T10:00:00Z"];
    const materialized: number[] = [];
    for (const stamp of stamps) {
      if (!isSuspended(result)) throw new Error("expected the run to park on the next update");
      // Play the delivery role, exactly like the production delivery port.
      await appendResolvedEntry({
        runsRoot,
        runId: result.runId,
        correlationId: result.correlationId,
        reply: update(stamp),
      });
      const window = await store.readReplayWindow(result.runId);
      materialized.push(window.materializedEntries);
      result = await resumeWorkflow(result.runId, workItem, args, base);
    }
    if (isSuspended(result)) throw new Error("the run must complete after three updates");
    expect(result.result).toEqual({ revision: 3, updatedAt: "2026-09-03T10:00:00Z" });

    // Resume 1 is a full replay (no boundary yet). Every later resume reads only the suffix after
    // the latest cursor — the register + the parked wait — never the already-processed updates.
    expect(materialized).toEqual([2, 2, 2]);

    // The latest boundary IS the watermark: source identity, cursor, observation time, plus the
    // bounded diagnostics ring (history: 2) of the cursors it replaced.
    const window = await store.readReplayWindow(result.runId);
    const state = window.checkpoint?.record.state as WatermarkState;
    expect(state).toMatchObject({
      v: 1,
      primitive: "watermark",
      source: "work-item.updates",
      cursor: { revision: 3, updatedAt: "2026-09-03T10:00:00Z" },
    });
    expect(typeof state.observedAt).toBe("number");
    expect(state.sources["work-item.updates"]?.diagnostics.map((point) => point.cursor)).toEqual([
      { revision: 1, updatedAt: "2026-09-01T10:00:00Z" },
      { revision: 2, updatedAt: "2026-09-02T10:00:00Z" },
    ]);

    // One register + one wait per iteration (3 × 2 envelopes), no re-fires across resumes.
    expect(broker.sent.map((envelope) => envelope.kind)).toEqual([
      "signal.register",
      "signal.wait",
      "signal.register",
      "signal.wait",
      "signal.register",
      "signal.wait",
    ]);

    // Replaying the completed run from its last boundary returns the same result, re-fires nothing.
    const sentBefore = broker.sent.length;
    const replayed = await resumeWorkflow(result.runId, workItem, args, base);
    if (isSuspended(replayed)) throw new Error("a completed run must not re-suspend on replay");
    expect(replayed.result).toEqual(result.result);
    expect(broker.sent.length).toBe(sentBefore);
  });

  it("rejects watermark() without its source capability, before journaling a boundary", async () => {
    const error = await startWorkflow(
      noCapability,
      {},
      { runsRoot, tools: [], runId: "run-watermark-nocap" },
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as Error).message).toContain("'source:work-item.updates'");
    const entries = await new FsJournalStore(runsRoot).readEntries("run-watermark-nocap");
    expect([...entries.bySeq.values()].filter((entry) => entry.kind === "checkpoint")).toEqual([]);
  });

  it("refuses watermark() in a sub-workflow body, before journaling a boundary", async () => {
    const error = await startWorkflow(
      subGuardParent,
      {},
      { runsRoot, tools: [], runId: "run-watermark-sub" },
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(SubWorkflowCheckpointError);
    expect((error as Error).message).toMatch(/^watermark\(\) is not valid inside a sub-workflow/);
    const entries = await new FsJournalStore(runsRoot).readEntries("run-watermark-sub");
    expect([...entries.bySeq.values()].filter((entry) => entry.kind === "checkpoint")).toEqual([]);
  });
});

describe("static capability scan — source:<name>", () => {
  const audit = (lines: ReadonlyArray<string>, declared: ReadonlyArray<string> = []) =>
    auditWorkflowSourceStatic(
      { absolutePath: "/virtual/source.workflow.ts", sourceText: lines.join("\n") },
      { declared: new Set(declared) },
    );
  const body = [
    `import { getSignalSource, watermark, WorkItemUpdates as Updates } from "@t3team/sdk";`,
    `export const meta = { name: "x.source", description: "d" } as const;`,
    `export default async function run() {`,
    `  const cursor = watermark("work-item.updates");`,
    `  const source = await getSignalSource(Updates, { projectId: "p", issueKey: "K" });`,
    `  return cursor.current();`,
    `}`,
  ];

  it("reports BOTH the getSignalSource and the watermark call site when source:<name> is missing", () => {
    const findings = audit(body);
    expect(findings.map((item) => item.rule)).toEqual(["missing-capability", "missing-capability"]);
    expect(findings.map((item) => item.message)).toEqual([
      expect.stringContaining("`watermark(work-item.updates)`"),
      expect.stringContaining("`getSignalSource(work-item.updates)`"),
    ]);
    expect(findings.every((item) => item.message.includes("'source:work-item.updates'"))).toBe(
      true,
    );
  });

  it("is clean once the source capability is declared", () => {
    expect(audit(body, ["source:work-item.updates"])).toEqual([]);
  });

  it("stays silent when the source is not statically knowable (miss > false alarm)", () => {
    const findings = audit([
      `import { getSignalSource, watermark } from "@t3team/sdk";`,
      `export const meta = { name: "x.dynamic", description: "d" } as const;`,
      `export default async function run() {`,
      `  const key = "work-item." + "updates";`,
      `  watermark(key);`,
      `  await getSignalSource(authorDefinedSource, {});`,
      `}`,
    ]);
    expect(findings).toEqual([]);
  });
});
