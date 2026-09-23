import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Schema from "effect/Schema";
import { afterAll, describe, expect, it } from "vite-plus/test";

import type * as RetryAgent from "./__fixtures__/t3team-sdk.retryAgent.workflow.ts";
import type * as RetryNoCapability from "./__fixtures__/t3team-sdk.retryNoCapability.workflow.ts";
import type * as RetrySubWorkflow from "./__fixtures__/t3team-sdk.retrySubWorkflow.workflow.ts";
import { demoScripts } from "./t3team-sdk.engineFixtures.ts";
import {
  appendResolvedEntry,
  createMockBroker,
  defineScript,
  defineWorkflow,
  FsJournalStore,
  PermissionDeniedError,
  resumeWorkflow,
  startWorkflow,
  type MockBrokerOutcome,
} from "./t3team-sdk.index.ts";
import type { MessageEnvelope } from "./t3team-sdk.broker.ts";
import { auditWorkflowSourceStatic } from "./t3team-sdk.staticAudit.ts";

/**
 * `retry` through the REAL SDK surface: fixture bodies that import it from `@t3team/sdk`, the
 * engine's run loop, a filesystem journal, and a host broker. The core contract (journal shape,
 * replay jump, retention) is pinned in `@runbook/core/retryBackoff.test.ts`; these pin the wiring.
 */
const runsRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-retry-"));
afterAll(() => NodeFS.rmSync(runsRoot, { recursive: true, force: true }));

const retryAgent = defineWorkflow<typeof RetryAgent>(
  "./__fixtures__/t3team-sdk.retryAgent.workflow.ts",
);
const retrySubWorkflow = defineWorkflow<typeof RetrySubWorkflow>(
  "./__fixtures__/t3team-sdk.retrySubWorkflow.workflow.ts",
);
const retryNoCapability = defineWorkflow<typeof RetryNoCapability>(
  "./__fixtures__/t3team-sdk.retryNoCapability.workflow.ts",
);

const promptOf = (envelope: MessageEnvelope): string => JSON.stringify(envelope.payload);

/** Answers agent turns (attempt 1 gets a bad reply) and PARKS every backoff wake. */
const hostBroker = () =>
  createMockBroker((envelope): MockBrokerOutcome => {
    if (envelope.kind === "thread.turn") {
      return { kind: "resolve", reply: promptOf(envelope).includes("attempt 1") ? "bad" : "good" };
    }
    if (envelope.kind === "wait.until") return { kind: "defer" };
    return { kind: "resolve", reply: undefined };
  });

/** A recipe script that fails attempt 2 outright, counting every live execution. */
const probeCalls: number[] = [];
const probeScripts = {
  probe: defineScript({
    inputs: Schema.Struct({ attempt: Schema.Number }),
    outputs: Schema.Struct({ ok: Schema.Boolean }),
    handler: async ({ attempt }) => {
      probeCalls.push(attempt);
      if (attempt === 2) throw new Error("probe: upstream 503");
      return { ok: true };
    },
  }),
};

const wakesOf = (broker: ReturnType<typeof hostBroker>) =>
  broker.sent.filter((envelope) => envelope.kind === "wait.until");

describe("retry through a real workflow body", () => {
  it("survives a crash at each backoff deadline and never re-drives a settled attempt", async () => {
    const runId = "run-retry-e2e";
    const opts = { runsRoot, tools: [], scripts: probeScripts, runId };

    // Process 1: attempt 1's agent answers "bad"; the body parks on the first backoff wake.
    const first = hostBroker();
    const parked1 = await startWorkflow(retryAgent, {}, { ...opts, broker: first });
    const [wake1] = wakesOf(first);
    expect(parked1).toMatchObject({ runId, suspended: true, correlationId: wake1?.correlationId });

    // The scheduler delivers wake 1; process 2 runs attempt 2, whose script THROWS, and parks on
    // wake 2. Attempt 1 is not re-driven: its agent turn is not re-sent, its probe does not re-run.
    await appendResolvedEntry({
      runsRoot,
      runId,
      correlationId: wake1!.correlationId,
      reply: undefined,
    });
    const second = hostBroker();
    const parked2 = await resumeWorkflow(runId, retryAgent, {}, { ...opts, broker: second });
    const [wake2] = wakesOf(second);
    expect(parked2).toMatchObject({ suspended: true, correlationId: wake2?.correlationId });
    expect(second.sent.map((envelope) => envelope.kind)).toEqual(["wait.until"]);
    expect(probeCalls).toEqual([1, 2]);

    // The process dies at the wake-2 deadline boundary. Process 3 resumes BEFORE the wake lands:
    // it parks on the SAME wake and fires nothing — no script, no agent, no second wake request.
    const early = hostBroker();
    const parked3 = await resumeWorkflow(runId, retryAgent, {}, { ...opts, broker: early });
    expect(parked3).toMatchObject({ suspended: true, correlationId: wake2?.correlationId });
    expect(early.sent).toEqual([]);
    expect(probeCalls).toEqual([1, 2]);

    // Wake 2 lands; process 4 runs attempt 3 — and only attempt 3 — live.
    await appendResolvedEntry({
      runsRoot,
      runId,
      correlationId: wake2!.correlationId,
      reply: undefined,
    });
    const late = hostBroker();
    const done = await resumeWorkflow(runId, retryAgent, {}, { ...opts, broker: late });
    expect(done).toMatchObject({ result: { attempt: 3, reply: "good" } });
    expect(probeCalls).toEqual([1, 2, 3]);
    const turns = late.sent.filter((envelope) => envelope.kind === "thread.turn");
    expect(turns).toHaveLength(1);
    expect(promptOf(turns[0]!)).toContain("attempt 3");
    expect(wakesOf(late)).toEqual([]);

    // The journaled deadlines are the ones the live attempts computed — never restarted.
    const entries = await new FsJournalStore(runsRoot).readEntries(runId);
    const settlements = [...entries.bySeq.values()]
      .filter((entry) => entry.kind === "retry" && entry.refId === "retry.attempt")
      .sort((a, b) => a.seq - b.seq)
      .map((entry) => entry.result);
    expect(settlements).toEqual([
      expect.objectContaining({
        attempt: 1,
        outcome: "retry",
        deadline: (wake1!.payload as { deadline: number }).deadline,
      }),
      expect.objectContaining({
        attempt: 2,
        outcome: "retry",
        failure: { classification: "retryable", name: "Error", message: "probe: upstream 503" },
        deadline: (wake2!.payload as { deadline: number }).deadline,
      }),
      expect.objectContaining({ attempt: 3, outcome: "ok" }),
    ]);
  });

  it("composes with workflow(): each attempt runs the sub-workflow inline", async () => {
    const runId = "run-retry-sub";
    const broker = createMockBroker(() => ({ kind: "resolve", reply: undefined }));
    const result = await startWorkflow(
      retrySubWorkflow,
      {},
      { runsRoot, tools: [], scripts: demoScripts, runId, broker },
    );
    expect(result).toMatchObject({ result: { attempt: 2, greeting: "hi try-2" } });

    // Both attempts' child script calls are journaled in the run's own sequence, around the
    // attempt-1 settlement and its backoff wake.
    const entries = await new FsJournalStore(runsRoot).readEntries(runId);
    const order = [...entries.bySeq.values()]
      .sort((a, b) => a.seq - b.seq)
      .map((entry) => `${entry.kind}:${entry.refId}`);
    expect(order).toEqual([
      "retry:retry.start",
      "script:greet",
      "retry:retry.attempt",
      "wait.until:wait.until",
      "script:greet",
      "retry:retry.attempt",
    ]);
  });

  it("refuses retry at run time without the 'schedule' capability", async () => {
    const error = await startWorkflow(
      retryNoCapability,
      {},
      { runsRoot, tools: [], runId: "run-retry-denied" },
    ).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(PermissionDeniedError);
    expect((error as Error).message).toContain("'schedule'");
  });
});

describe("static capability scan treats retry() as a schedule use", () => {
  const audit = (lines: ReadonlyArray<string>, declared: ReadonlyArray<string> = []) =>
    auditWorkflowSourceStatic(
      { absolutePath: "/virtual/retry.workflow.ts", sourceText: lines.join("\n") },
      { declared: new Set(declared) },
    );

  const retryBody = [
    `import { retry } from "@t3team/sdk";`,
    `export const meta = { name: "x.retry", description: "d" } as const;`,
    `export default async function run() {`,
    `  return await retry(async () => 1, { maxAttempts: 2, backoff: () => 0 });`,
    `}`,
  ];

  it("warns when a body calls only retry() and never waitUntil()", () => {
    const findings = audit(retryBody);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.rule).toBe("missing-capability");
    expect(findings[0]?.message).toContain("`retry(…)`");
    expect(findings[0]?.message).toContain("'schedule'");
  });

  it("is satisfied by a declared 'schedule' capability", () => {
    expect(audit(retryBody, ["schedule"])).toEqual([]);
  });

  it("resolves an aliased retry import", () => {
    const findings = audit([
      `import { retry as again } from "@t3team/sdk";`,
      `export const meta = { name: "x.alias", description: "d" } as const;`,
      `export default async function run() {`,
      `  await again(async () => 1, { maxAttempts: 1, backoff: () => 0 });`,
      `}`,
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("'schedule'");
  });

  it("does not gate an author's own retry helper in a globals body", () => {
    const findings = audit([
      `export const meta = { name: "x.own", description: "d" } as const;`,
      `async function retry(fn) { return fn(); }`,
      `export default async function run() {`,
      `  return await retry(async () => 1);`,
      `}`,
    ]);
    expect(findings).toEqual([]);
  });
});
