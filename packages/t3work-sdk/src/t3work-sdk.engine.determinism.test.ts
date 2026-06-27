/**
 * Deterministic-globals tests: the journaled `Date`/`Math.random`/`crypto.randomUUID`
 * round-trip (a resume replays the recorded value, not a fresh wall-clock/entropy read),
 * the drift machinery covers the new `now`/`random`/`uuid` journal kinds, and the host
 * Error intrinsics are injected so `instanceof Error` holds inside the body. There is no
 * banning here — Stage-1 has no sandbox (trust model: "trusted project code").
 */

import { readFileSync, writeFileSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  cleanupRunsRoot,
  demoTools,
  errorGlobalsWorkflow,
  nowWorkflow,
  randomWorkflow,
  resetCounters,
  runsRoot,
  uuidWorkflow,
} from "./t3work-sdk.engineFixtures.ts";
import { ReplayDriftError, resumeWorkflow, startWorkflow } from "./t3work-sdk.index.ts";
import { journalFilePath } from "./t3work-sdk.journal.ts";
import { readJournal } from "./t3work-sdk.journalReader.ts";

beforeEach(resetCounters);
afterAll(cleanupRunsRoot);

describe("durable workflow engine — deterministic globals", () => {
  it("binds the error-class globals and satisfies instanceof Error inside the body", async () => {
    const { result } = await startWorkflow(
      errorGlobalsWorkflow,
      {},
      { runsRoot, tools: demoTools },
    );
    expect(result).toEqual({
      workflowErrorIsError: true, // WorkflowError extends the injected host Error
      cancelledIsCancelled: true, // CancelledError is bound and matches itself
      cancelledIsError: true, // …and is an Error
      plainThrowIsError: true, // a plain `new Error()` is an Error too
    });
  });

  it("journals Date.now() and new Date() and replays the recorded millis on resume", async () => {
    const { runId, result } = await startWorkflow(nowWorkflow, {}, { runsRoot, tools: demoTools });
    expect(typeof result.stamp).toBe("number");
    expect(result.viaNew).toBeGreaterThan(0);
    // `iso` is derived from the same journaled `new Date()` as `viaNew`.
    expect(new Date(result.iso).getTime()).toBe(result.viaNew);
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(2);
    expect(journal.get(1)).toMatchObject({ seq: 1, kind: "now", refId: "now" });
    expect(journal.get(2)).toMatchObject({ seq: 2, kind: "now", refId: "now" });
    const resumed = await resumeWorkflow(runId, nowWorkflow, {}, { runsRoot, tools: demoTools });
    expect(resumed.result).toEqual(result); // exact replay — no fresh clock read
  });

  it("journals Math.random() and replays the recorded floats; Math.floor passes through", async () => {
    const { runId, result } = await startWorkflow(
      randomWorkflow,
      {},
      { runsRoot, tools: demoTools },
    );
    expect(result.a).toBeGreaterThanOrEqual(0);
    expect(result.a).toBeLessThan(1);
    expect(result.b).not.toBe(result.a); // two independent journaled draws
    expect(result.scaled).toBe(Math.floor(result.a * 1000)); // real Math.floor reachable in the body
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(2);
    expect(journal.get(1)).toMatchObject({ seq: 1, kind: "random", refId: "random" });
    const resumed = await resumeWorkflow(runId, randomWorkflow, {}, { runsRoot, tools: demoTools });
    expect(resumed.result).toEqual(result);
  });

  it("journals crypto.randomUUID() and replays the recorded ids on resume", async () => {
    const { runId, result } = await startWorkflow(uuidWorkflow, {}, { runsRoot, tools: demoTools });
    expect(result.id1).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.id2).not.toBe(result.id1);
    const journal = readJournal(journalFilePath(runsRoot, runId));
    expect(journal.size).toBe(2);
    expect(journal.get(1)).toMatchObject({ seq: 1, kind: "uuid", refId: "uuid" });
    const resumed = await resumeWorkflow(runId, uuidWorkflow, {}, { runsRoot, tools: demoTools });
    expect(resumed.result).toEqual(result);
  });

  it("drifts when a recorded deterministic entry diverges (args + call identity)", async () => {
    // (a) args drift: tamper the recorded argsHash of the first now() call.
    const argsRun = await startWorkflow(nowWorkflow, {}, { runsRoot, tools: demoTools });
    const argsFile = journalFilePath(runsRoot, argsRun.runId);
    const argsLines = readFileSync(argsFile, "utf8").trim().split("\n");
    const argsEntry = JSON.parse(argsLines[0] ?? "{}") as { argsHash: string };
    argsEntry.argsHash = "f".repeat(64);
    argsLines[0] = JSON.stringify(argsEntry);
    writeFileSync(argsFile, `${argsLines.join("\n")}\n`);
    const argsErr = await resumeWorkflow(
      argsRun.runId,
      nowWorkflow,
      {},
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(argsErr).toBeInstanceOf(ReplayDriftError);
    expect((argsErr as ReplayDriftError).seq).toBe(1);
    expect((argsErr as ReplayDriftError).reason).toBe("args");

    // (b) call-identity drift: tamper the recorded kind so it no longer matches "now".
    const callRun = await startWorkflow(nowWorkflow, {}, { runsRoot, tools: demoTools });
    const callFile = journalFilePath(runsRoot, callRun.runId);
    const callLines = readFileSync(callFile, "utf8").trim().split("\n");
    const callEntry = JSON.parse(callLines[0] ?? "{}") as { kind: string };
    callEntry.kind = "random";
    callLines[0] = JSON.stringify(callEntry);
    writeFileSync(callFile, `${callLines.join("\n")}\n`);
    const callErr = await resumeWorkflow(
      callRun.runId,
      nowWorkflow,
      {},
      { runsRoot, tools: demoTools },
    ).catch((e: unknown) => e);
    expect(callErr).toBeInstanceOf(ReplayDriftError);
    expect((callErr as ReplayDriftError).reason).toBe("call");
    expect((callErr as ReplayDriftError).expected.kind).toBe("random");
    expect((callErr as ReplayDriftError).observed.kind).toBe("now");
  });
});
