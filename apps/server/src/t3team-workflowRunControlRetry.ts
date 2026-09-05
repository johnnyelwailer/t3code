/**
 * The failed-run branch of the shared workflow control sequence (GHE #344): "Retry run" on a
 * terminal-failed card re-drives the run from its journal — the SAME re-drive the
 * `t3team.orchestration.resume` broker tool uses (`makeResumeFailedRun`), surfaced over the
 * card's transport. Split out of t3team-workflowRunControl.ts for the additive size budget, and
 * built ON TOP of that module so the card and the agent tool keep one control vocabulary.
 *
 * Returned status: `running` for a detached same-prefix journal replay, `suspended` when the
 * re-drive is a re-issued agent turn (GHE #403) that parks waiting for the step to answer.
 */
import { ThreadId } from "@t3tools/contracts";
import type { JournalStore } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { reportStaleWrite } from "./t3team-workflowRunControlCas.ts";
import type {
  WorkflowRunControlDeps,
  WorkflowRunControlStatus,
} from "./t3team-workflowRunControl.ts";
import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";
import {
  makeResumeFailedRun,
  retainedFailedTurnStep,
} from "./t3team-toolBrokerWorkflowResumeFailed.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

/** What a failed-run retry needs on top of the shared control deps. The card's route wires all
 * of it from the durable-engine services; an environment without it simply does not offer retry. */
export interface WorkflowRunControlRetryDeps {
  readonly journalStore: JournalStore;
  readonly fileSystem?: FileSystem.FileSystem | undefined;
  readonly path?: Path.Path | undefined;
  readonly loadThreadProject: (
    threadId: ThreadId,
  ) => Effect.Effect<
    { readonly project: { readonly workspaceRoot: string | null | undefined } },
    string
  >;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Re-drive a terminal-failed run from its journal. Fails (string) when nothing can be re-driven
 * — the card surfaces the message and the run stays `failed`, never a phantom "running". */
export const retryFailedWorkflowRun = (
  deps: WorkflowRunControlDeps & { readonly retryFailed?: WorkflowRunControlRetryDeps | undefined },
  run: WorkflowRun,
  threadId: string,
): Effect.Effect<{ readonly status: WorkflowRunControlStatus }, string> =>
  Effect.gen(function* () {
    const retry = deps.retryFailed;
    if (retry === undefined) {
      return yield* Effect.fail("Retry of failed runs is not available in this runtime.");
    }
    // No journal means nothing to replay — re-driving would settle "failed" again immediately
    // and the optimistic "running" the client flips to would never reconcile back (GHE #344).
    if (!(yield* Effect.promise(() => retry.journalStore.hasRun(run.runId)))) {
      return yield* Effect.fail("This run has no journal to resume from — relaunch it instead.");
    }
    // A host-detected step failure keeps its retained `thread.turn` ask (GHE #403); re-driving it
    // needs the live turn re-drive. Check BEFORE the admission flip so the row is untouched.
    if (retainedFailedTurnStep(run) !== null && deps.turnRedrive === undefined) {
      return yield* Effect.fail(
        "Re-driving a failed agent step is not available in this runtime (no thread query / dispatch).",
      );
    }
    // Admission lock (GHE #411 §1 style): only a still-`failed` row is claimed — a second click,
    // or a settle that lands between the read and here, is reported instead of double-driving.
    const affected = yield* deps.repo
      .casSetStatus({
        runId: run.runId,
        status: "running",
        updatedAt: deps.nowIso(),
        expectedStatuses: ["failed"],
      })
      .pipe(Effect.mapError(errorMessage));
    if (!affected) return yield* reportStaleWrite(deps.repo, run.runId);
    const drive = makeResumeFailedRun(
      {
        fileSystem: retry.fileSystem,
        path: retry.path,
        runRepository: deps.repo,
        registry: deps.registry,
        journalStore: retry.journalStore,
        rearmScheduler: deps.rearmScheduler,
        dispatch: (command) => Effect.runPromise(deps.dispatch(command)).then(() => undefined),
        loadThreadProject: retry.loadThreadProject,
        ...(deps.turnRedrive === undefined ? {} : { turnRedrive: deps.turnRedrive }),
      },
      ThreadId.make(threadId),
      t3teamRandomUUID,
    )(run);
    const outcome = yield* drive.pipe(
      Effect.match({
        onFailure: (message) => ({ ok: false as const, message }),
        onSuccess: (value) => ({ ok: true as const, value }),
      }),
    );
    if (!outcome.ok) {
      // The re-drive died before it claimed the run — hand the card its retry affordance back.
      yield* deps.repo
        .setStatus({ runId: run.runId, status: "failed", updatedAt: deps.nowIso() })
        .pipe(Effect.mapError(errorMessage));
      return yield* Effect.fail(outcome.message);
    }
    return {
      status: outcome.value.status === "suspended" ? "suspended" : "running",
    };
  });
