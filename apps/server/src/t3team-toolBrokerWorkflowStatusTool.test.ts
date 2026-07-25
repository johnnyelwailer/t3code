/**
 * `t3team.orchestration.status` — handler-level tests against a stubbed WorkflowRunRepository (no
 * real DB): known runId returns status + hint, unknown runId fails with a helpful string, and
 * list mode (no runId) returns recent runs. Mirrors the stub-dependency style of sibling broker
 * tool tests rather than the real-DB harness in t3team-toolBrokerWorkflowRunTools.test.ts.
 */
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type {
  WorkflowRun,
  WorkflowRunRepositoryShape,
} from "./persistence/Services/WorkflowRuns.ts";
import { makeWorkflowStatusToolHandlers } from "./t3team-toolBrokerWorkflowStatusTool.ts";

const threadId = ThreadId.make("thread-status");
const projectId = ProjectId.make("proj-status");
const modelSelection = createModelSelection(ProviderInstanceId.make("inst-1"), "model-x");

const notImplemented = (method: string) => () =>
  Effect.die(`WorkflowRunRepositoryShape.${method} not stubbed for this test`);

const baseRow = (overrides: Partial<WorkflowRun>): WorkflowRun => ({
  runId: "run-1",
  workflowPath: "/workspace/.t3team-runs/run-1/workflow.ts",
  args: {},
  argsHash: "hash-1",
  launchThreadId: threadId,
  projectId,
  modelSelection,
  runtimeMode: "full-access",
  interactionMode: "default",
  status: "suspended",
  origin: "ephemeral",
  recipePath: null,
  pendingThreadId: threadId,
  pendingCorrelationId: "run-1:1",
  pendingKind: "user.input",
  wakeAt: null,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:01:00.000Z",
  ...overrides,
});

/** A stubbed WorkflowRunRepositoryShape: only `getById` and `listRecent` are exercised by
 * `t3team.orchestration.status`, so every other method dies loudly if the tool ever reaches for it. */
function makeStubRepository(rows: ReadonlyArray<WorkflowRun>): WorkflowRunRepositoryShape {
  return {
    upsert: notImplemented("upsert"),
    getById: ({ runId }) => {
      const row = rows.find((candidate) => candidate.runId === runId);
      return Effect.succeed(row ? Option.some(row) : Option.none());
    },
    listByStatus: notImplemented("listByStatus"),
    listRecent: ({ limit }) =>
      Effect.succeed(
        [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit),
      ),
    setStatus: notImplemented("setStatus"),
    resumePaused: notImplemented("resumePaused"),
    setPending: notImplemented("setPending"),
    clearPending: notImplemented("clearPending"),
    countLiveByOrigin: notImplemented("countLiveByOrigin"),
    setSleeping: notImplemented("setSleeping"),
  };
}

describe("t3team.orchestration.status", () => {
  it.effect("returns status + hint for a known runId", () =>
    Effect.gen(function* () {
      const row = baseRow({ runId: "run-known", status: "suspended", pendingKind: "user.input" });
      const handlers = makeWorkflowStatusToolHandlers({
        runRepository: makeStubRepository([row]),
      })(threadId);

      const value = yield* handlers.getStatus({ runId: "run-known" });

      assert.deepStrictEqual(value, {
        runId: "run-known",
        status: "suspended",
        origin: "ephemeral",
        pendingKind: "user.input",
        wakeAt: undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        hint: "Parked waiting on user.input; it resumes automatically when that resolves.",
      });
    }),
  );

  it.effect("fails with a helpful string for an unknown runId", () =>
    Effect.gen(function* () {
      const handlers = makeWorkflowStatusToolHandlers({
        runRepository: makeStubRepository([]),
      })(threadId);

      const result = yield* handlers.getStatus({ runId: "does-not-exist" }).pipe(Effect.result);

      assert.strictEqual(result._tag, "Failure");
      if (result._tag === "Failure") {
        assert.include(result.failure, "does-not-exist");
        assert.include(result.failure, "Omit runId to list");
      }
    }),
  );

  it.effect("lists the most recent runs when runId is omitted", () =>
    Effect.gen(function* () {
      const older = baseRow({
        runId: "run-older",
        status: "completed",
        pendingKind: null,
        pendingThreadId: null,
        pendingCorrelationId: null,
        updatedAt: "2026-07-19T00:00:00.000Z",
      });
      const newer = baseRow({
        runId: "run-newer",
        status: "running",
        pendingKind: null,
        pendingThreadId: null,
        pendingCorrelationId: null,
        updatedAt: "2026-07-20T12:00:00.000Z",
      });
      const handlers = makeWorkflowStatusToolHandlers({
        runRepository: makeStubRepository([older, newer]),
      })(threadId);

      const value = yield* handlers.getStatus({});

      assert.deepStrictEqual(value, {
        runs: [
          { runId: "run-newer", status: "running", updatedAt: newer.updatedAt },
          { runId: "run-older", status: "completed", updatedAt: older.updatedAt },
        ],
      });
    }),
  );

  it.effect("never exposes another thread's runs — by id or in list mode", () =>
    Effect.gen(function* () {
      const foreign = baseRow({
        runId: "run-foreign",
        launchThreadId: ThreadId.make("someone-elses-thread"),
        status: "running",
      });
      const handlers = makeWorkflowStatusToolHandlers({
        runRepository: makeStubRepository([foreign]),
      })(threadId);

      // By id: answers exactly like an unknown runId, so ids can't be probed.
      const denied = yield* Effect.flip(handlers.getStatus({ runId: "run-foreign" }));
      assert.match(String(denied), /No orchestration run found/);

      // List mode: the foreign run simply isn't there.
      const listed = yield* handlers.getStatus({});
      assert.deepStrictEqual(listed, { runs: [] });
    }),
  );
});
