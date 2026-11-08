/**
 * Thread handoff RPCs ("Move to" another machine), see `t3team-threadHandoff` in contracts.
 *
 *  - `prepareThreadHandoff` (source environment, read-only): the continuation envelope's
 *    ingredients — `full_thread_summary`, thread facts, branch state — and the eligibility
 *    verdict. "Move when the turn ends" first waits for the active run (bounded) with the
 *    existing `waitForThread`, and refuses if the turn is still running after it. A check that
 *    cannot be read refuses (see `threadHandoffRefusals`).
 *  - `recordThreadHandoff` (either environment): writes the link fact both threads show.
 *
 * The client drives the order (capture → launch → verify → record); nothing here mutates a
 * thread's run state, so a failed launch leaves the source untouched.
 * @module t3team-threadHandoff
 */
import {
  T3TEAM_THREAD_HANDOFF_FACT_KEY,
  type ScheduledTask,
  type ScheduledTaskError,
  type T3TeamThreadHandoffCapture,
  T3TeamThreadHandoffError,
  type T3TeamThreadHandoffPrepareInput,
  type T3TeamThreadHandoffRecordInput,
  type T3TeamThreadHandoffRecordResult,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

import {
  DEFAULT_HANDOFF_TOKEN_CAP,
  handoffTokenCapConfig,
} from "@t3tools/provider-core/server/handoffBudget";
import * as ProjectStore from "./orchestration-v2/ProjectStore.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { featureDisabledMessage } from "./t3team-featureFlagRoute.ts";
import {
  readHandoffBranchState,
  readHandoffHasOrigin,
  UNKNOWN_BRANCH_STATE,
} from "./t3team-threadHandoffBranchState.ts";
import {
  renderThreadHandoffSummary,
  threadHandoffRefusals,
} from "./t3team-threadHandoffCapture.ts";
import { collectSubagentDescendants } from "./t3team-threadStopCascade.ts";
import type { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import type { VcsProcess } from "./vcs/VcsProcess.ts";

/** "Move when the turn ends" waits at most this long; a turn still running then is not moved. */
const HANDOFF_TURN_END_WAIT_MS = 10 * 60_000;

const fail = (message: string) => new T3TeamThreadHandoffError({ message });

const failWith = (message: string) => (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.fail(fail(message));

export const prepareThreadHandoff = Effect.fn("t3team.threadHandoff.prepare")(function* (
  input: T3TeamThreadHandoffPrepareInput,
  deps: {
    readonly vcs?: VcsProcess["Service"] | undefined;
    /** Tasks whose thread binding cannot move; a failed read refuses the move. */
    readonly scheduledTasks?: Effect.Effect<ReadonlyArray<ScheduledTask>, ScheduledTaskError>;
  } = {},
) {
  if (!readFeatureFlag("CLOUD_THREAD_HANDOFF")) {
    return yield* fail(featureDisabledMessage("CLOUD_THREAD_HANDOFF"));
  }
  const threads = yield* ThreadManagementService;
  const projects = yield* ProjectStore.ProjectStoreV2;
  const readShell = threads
    .getThreadShell(input.threadId)
    .pipe(Effect.catchCause(failWith("Could not read the thread.")));
  let shell = yield* readShell;
  if (shell === null) return yield* fail("The thread no longer exists.");
  if (input.waitForTurnEnd === true && shell.activeRunId !== null) {
    yield* threads
      .waitForThread({
        projectId: shell.projectId,
        threadId: shell.id,
        runId: shell.activeRunId,
        timeoutMs: HANDOFF_TURN_END_WAIT_MS,
      })
      .pipe(Effect.catchCause(failWith("Could not wait for the turn to end.")));
    const after = yield* readShell;
    if (after === null) return yield* fail("The thread no longer exists.");
    // Capturing now would let the client stop the very turn the user chose to wait for.
    if (after.activeRunId !== null) {
      return yield* fail("The turn is still running, so the thread was not moved.");
    }
    shell = after;
  }

  const records = yield* threads
    .getThreadRecords(shell.id, ["runs", "turnItems"])
    .pipe(Effect.catchCause(failWith("Could not read the thread history.")));
  const budget = yield* handoffTokenCapConfig.pipe(
    Effect.orElseSucceed(() => DEFAULT_HANDOFF_TOKEN_CAP),
  );
  const summaryText = renderThreadHandoffSummary({
    threadId: shell.id,
    runs: records.runs,
    items: records.turnItems,
    budget,
  });

  const project = yield* projects.get(shell.projectId).pipe(
    Effect.map(Option.getOrUndefined),
    Effect.orElseSucceed(() => undefined),
  );
  const cwd = shell.worktreePath ?? project?.workspaceRoot ?? null;
  const branchState =
    deps.vcs === undefined || cwd === null
      ? UNKNOWN_BRANCH_STATE
      : yield* readHandoffBranchState(deps.vcs, cwd, shell.branch);
  const hasOrigin =
    deps.vcs === undefined || cwd === null ? null : yield* readHandoffHasOrigin(deps.vcs, cwd);

  // A read that fails is `null`: the verdict refuses it instead of counting none.
  const snapshot = yield* threads.getShellSnapshot({ location: "active" }).pipe(
    Effect.map((value) => value.threads),
    Effect.orElseSucceed(() => null),
  );
  const descendants = new Set<string>(
    snapshot === null ? [] : collectSubagentDescendants(shell.id, snapshot),
  );
  const liveSubagentChildren =
    snapshot === null
      ? null
      : snapshot.filter(
          (child) =>
            descendants.has(child.id) &&
            (child.activeRunId !== null || (child.pendingBackgroundTasks?.length ?? 0) > 0),
        ).length;
  const tasks =
    deps.scheduledTasks === undefined
      ? []
      : yield* deps.scheduledTasks.pipe(Effect.orElseSucceed(() => null));
  const boundScheduledTasks =
    tasks === null ? null : tasks.filter((task) => task.threadId === shell.id).length;

  return {
    threadId: shell.id,
    projectId: shell.projectId,
    title: shell.title,
    branch: shell.branch,
    worktreePath: shell.worktreePath,
    activeRunId: shell.activeRunId,
    summaryText,
    branchState,
    refusals: threadHandoffRefusals({
      shell,
      branchState,
      hasOrigin,
      liveSubagentChildren,
      boundScheduledTasks,
    }),
    capturedAt: DateTime.formatIso(DateTime.nowUnsafe()),
  } satisfies T3TeamThreadHandoffCapture;
});

export const recordThreadHandoff = Effect.fn("t3team.threadHandoff.record")(function* (
  input: T3TeamThreadHandoffRecordInput,
  factsStore: T3TeamThreadFactsStore["Service"] | undefined,
) {
  if (factsStore === undefined) return yield* fail("Thread facts are unavailable here.");
  const link = {
    direction: input.direction,
    peerEnvironmentId: input.peerEnvironmentId,
    peerThreadId: input.peerThreadId,
    peerLabel: input.peerLabel,
    recordedAt: DateTime.formatIso(DateTime.nowUnsafe()),
  };
  yield* factsStore
    .upsert(input.threadId, { extensions: { [T3TEAM_THREAD_HANDOFF_FACT_KEY]: link } })
    .pipe(Effect.catchCause(failWith("Could not record the move.")));
  return { link } satisfies T3TeamThreadHandoffRecordResult;
});
