import type {
  ProviderJobSummary,
  ProviderSession,
  ServerSignalProcessInput,
} from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { buildThreadCleanupPlan } from "./t3team-resourcePressureCleanupPlan.ts";
import { processEntry, telemetry } from "./t3team-resourcePressureTestFixtures.ts";
import {
  executeThreadCleanup,
  previewThreadCleanup,
  type ThreadCleanupDeps,
} from "./t3team-resourcePressureThreadCleanup.ts";

const MIB = 1024 ** 2;
const threadId = ThreadId.make("thread-1");

// server 10 → agent CLI 11 → job 12 (ours); job 50's parent 49 is not in the scan; 60 is Electron.
const scan = telemetry([
  processEntry(10, 100 * MIB, "server", 1),
  processEntry(11, 300 * MIB, "server-child", 10),
  processEntry(12, 200 * MIB, "server-child", 11),
  processEntry(50, 50 * MIB, "server-child", 49),
  processEntry(60, 50 * MIB, "electron-renderer", 10),
]);

const job = (jobId: string, pid: number | undefined, state = "running"): ProviderJobSummary =>
  ({
    jobId,
    command: `cmd-${jobId}`,
    ...(pid === undefined ? {} : { pid }),
    state,
    exitCode: null,
    startedAtMs: 0,
  }) as ProviderJobSummary;

const JOBS = [
  job("ours", 12),
  job("orphan", 50),
  job("renderer", 60),
  job("no-pid", undefined),
  job("gone", 77),
  job("done", 12, "completed"),
];

describe("per-thread cleanup plan (lineage-gated)", () => {
  it("only ppid-verified backend descendants become SIGINT targets; the rest are listed", () => {
    const plan = buildThreadCleanupPlan({
      threadId,
      jobs: JOBS,
      session: { provider: "pi" },
      telemetry: scan,
      serverPid: 10,
    });
    assert.deepStrictEqual(
      plan.targets.map((target) => [target.pid, target.startTimeMs, target.jobId]),
      [[12, 120, "ours"]],
    );
    assert.include(plan.targets[0]!.reason, "background job ours");
    assert.deepStrictEqual(
      plan.skipped.map((entry) => entry.label.split(" ")[1]),
      ["orphan", "renderer", "no-pid", "gone"],
    );
    assert.include(plan.skipped[0]!.reason, "not a verified descendant");
    assert.include(plan.agentSession?.reason ?? "", "stopped through its provider");
  });

  it("a failed scan verifies nothing", () => {
    const plan = buildThreadCleanupPlan({
      threadId,
      jobs: JOBS,
      session: null,
      telemetry: null,
      serverPid: 10,
    });
    assert.deepStrictEqual(plan.targets, []);
    assert.strictEqual(plan.skipped.length, 5);
    assert.strictEqual(plan.agentSession, null);
  });
});

describe("per-thread cleanup execute", () => {
  const makeDeps = (enabled = true) => {
    const signals: ServerSignalProcessInput[] = [];
    const commands: string[] = [];
    const deps: ThreadCleanupDeps = {
      enabled,
      serverPid: 10,
      telemetry: { refresh: Effect.succeed(scan) },
      providers: {
        jobControl: () => Effect.succeed({ kind: "jobs", jobs: JOBS }),
        listSessions: () =>
          Effect.succeed([{ threadId, provider: "pi" } as unknown as ProviderSession]),
      },
      signal: (input) =>
        Effect.sync(() => {
          signals.push(input);
          return { pid: input.pid, signal: input.signal, signaled: true, message: Option.none() };
        }),
      engine: {
        dispatch: (command) =>
          Effect.sync(() => {
            commands.push(command.type);
            return { sequence: 1 };
          }) as never,
      },
    };
    return { deps, signals, commands };
  };

  it.effect("SIGINTs exactly the confirmed, re-verified identities, then stops the session", () =>
    Effect.gen(function* () {
      const { deps, signals, commands } = makeDeps();
      const result = yield* executeThreadCleanup(deps, {
        threadId,
        // 12 is ours; 12 with a stale start time and 60 (renderer) were never verified targets.
        targets: [
          { pid: 12, startTimeMs: 120 },
          { pid: 12, startTimeMs: 999 },
          { pid: 60, startTimeMs: 600 },
        ],
        stopAgentSession: true,
      });
      assert.deepStrictEqual(signals, [{ pid: 12, startTimeMs: 120, signal: "SIGINT" }]);
      assert.deepStrictEqual(result.signaled, [12]);
      assert.deepStrictEqual(
        result.notSignaled.map((entry) => entry.pid),
        [12, 60],
      );
      assert.isTrue(result.agentSessionStopped);
      assert.deepStrictEqual(commands, ["thread.session.stop"]);
    }),
  );

  it.effect("flag off: no scan, no signal, no stop", () =>
    Effect.gen(function* () {
      const { deps, signals, commands } = makeDeps(false);
      const plan = yield* previewThreadCleanup(deps, threadId);
      assert.isFalse(plan.enabled);
      const result = yield* executeThreadCleanup(deps, {
        threadId,
        targets: [{ pid: 12, startTimeMs: 120 }],
        stopAgentSession: true,
      });
      assert.deepStrictEqual([signals.length, commands.length], [0, 0]);
      assert.isFalse(result.agentSessionStopped);
    }),
  );
});
