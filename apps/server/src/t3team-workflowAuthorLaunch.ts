// @effect-diagnostics globalTimers:off -- the author turn deadline is a host wall-clock ceiling.
/**
 * Authoring an ephemeral orchestration from `intent`: the run exists (durable row, plan card,
 * "Authoring" step) BEFORE any source does, the hidden author agent writes and validates the source
 * through its tools, and its successful submission launches the SAME run through the shared
 * {@link launchPreparedWorkflow} funnel. The caller's tool call returns at `onAdmitted`; everything
 * after that is detached and reaches the caller only through the run's own channels (the card, and
 * on an unfixable outcome the ONE terminal failure notice).
 */
import type { ModelSelection, ServerProvider } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { settleWorkflowRunFailure } from "./t3team-workflowRunFailure.ts";
import { persistEphemeralWorkflowSource } from "./t3team-workflowRunPathAuthorize.ts";
import { buildWorkflowAuthorKickoff } from "./t3team-workflowAuthorPrompt.ts";
import {
  registerWorkflowAuthorSession,
  type WorkflowAuthorSession,
} from "./t3team-workflowAuthorSession.ts";
import { admitAuthoringRun } from "./t3team-workflowAuthorAdmit.ts";
import { retireWorkflowAuthorThread } from "./t3team-workflowAuthorThreadCleanup.ts";
import {
  driveWorkflowAuthorTurn,
  WorkflowAuthorTurnStopped,
  type WorkflowAuthorThreadDeps,
} from "./t3team-workflowAuthorTurn.ts";
import { launchPreparedWorkflow } from "./t3team-workflowEphemeralLaunch.ts";
import type {
  PreparedWorkflowLaunchDeps,
  PreparedWorkflowLaunchInput,
} from "./t3team-workflowEphemeralLaunchTypes.ts";
import { checkWorkflowSource } from "./t3team-workflowSourceCheck.ts";

/** Ceiling for one authoring turn; a turn that outlives it is a failed authoring, reported once. */
export const WORKFLOW_AUTHOR_TURN_TIMEOUT_MS = 15 * 60_000;

export interface WorkflowAuthorLaunchDeps {
  readonly launch: PreparedWorkflowLaunchDeps;
  readonly author: Omit<WorkflowAuthorThreadDeps, "host" | "registry">;
  /** Live provider snapshots for the source check's model gate; absent skips that gate. */
  readonly listProviders?: (() => Promise<ReadonlyArray<ServerProvider>>) | undefined;
  readonly turnTimeoutMs?: number | undefined;
}

export type WorkflowAuthorLaunchInput = Omit<
  PreparedWorkflowLaunchInput,
  "workflowPath" | "origin" | "intent" | "onAdmitted"
> & {
  readonly intent: NonNullable<PreparedWorkflowLaunchInput["intent"]>;
  readonly launchThreadId: string;
  readonly authorModelSelection: ModelSelection;
  readonly draftSource?: string | undefined;
  /** Resolves once the run row, its card and its "Authoring" step exist — the tool call's return. */
  readonly onAdmitted: () => Promise<void>;
};

export const startAuthoredWorkflowRun = Effect.fn("startAuthoredWorkflowRun")(function* (
  deps: WorkflowAuthorLaunchDeps,
  input: WorkflowAuthorLaunchInput,
) {
  const { launch } = deps;
  const { fileSystem, path } = launch;
  if (fileSystem === undefined || path === undefined) {
    return yield* Effect.fail("Filesystem services are required to author an orchestration.");
  }
  const workflowPath = path.join(input.workspaceRoot, ".t3team-runs", input.runId, "workflow.ts");
  const prepared = {
    ...input,
    workflowPath,
    origin: "ephemeral",
    intent: input.intent,
  } satisfies PreparedWorkflowLaunchInput;
  const authorDeps: WorkflowAuthorThreadDeps = {
    ...deps.author,
    host: launch.host,
    registry: launch.registry,
  };

  const { lifecycle, stepActivities, authorThreadId, authorStepId, isStopped } =
    yield* admitAuthoringRun({
      launch,
      authorDeps,
      prepared,
      authorModelSelection: input.authorModelSelection,
    });
  yield* Effect.promise(input.onAdmitted);

  let launched = false;
  const session: WorkflowAuthorSession = {
    runId: input.runId,
    launchThreadId: input.launchThreadId,
    authorThreadId,
    authorModelSelection: input.authorModelSelection,
    intent: input.intent,
    declined: false,
    submit: undefined,
  };
  registerWorkflowAuthorSession(session);
  const providers =
    deps.listProviders === undefined ? undefined : yield* Effect.promise(deps.listProviders);
  session.submit = async (source) => {
    const verdict = checkWorkflowSource({
      source,
      absolutePath: workflowPath,
      providers,
      baseModelSelection: input.modelSelection,
    });
    if (!verdict.ok) return verdict;
    await Effect.runPromise(
      persistEphemeralWorkflowSource({
        fileSystem,
        path,
        workspaceRoot: input.workspaceRoot,
        runId: input.runId,
        content: source,
      }),
    );
    launched = true;
    session.submit = undefined;
    // The real launch: same funnel as a direct launch, same run id, detached from the author's turn.
    await Effect.runPromise(
      launchPreparedWorkflow(launch, prepared).pipe(Effect.forkDetach({ startImmediately: true })),
    );
    return { ok: true, runId: input.runId };
  };

  const outcome = yield* Effect.promise(() =>
    driveWorkflowAuthorTurn(authorDeps, {
      ...input,
      authorThreadId,
      correlationId: authorStepId,
      text: buildWorkflowAuthorKickoff({
        intent: input.intent,
        args: input.args,
        draftSource: input.draftSource,
        providers,
      }),
      timeoutMs: deps.turnTimeoutMs ?? WORKFLOW_AUTHOR_TURN_TIMEOUT_MS,
    }).then(
      (reply) => ({ kind: "ended" as const, reply }),
      (error: unknown) => ({ kind: "failed" as const, error }),
    ),
  );
  session.submit = undefined;
  const retire = () => retireWorkflowAuthorThread({ runId: input.runId, host: launch.host });
  if (
    isStopped() ||
    (outcome.kind === "failed" && outcome.error instanceof WorkflowAuthorTurnStopped)
  ) {
    yield* Effect.promise(retire);
    return;
  }
  if (launched) {
    // Kept alive for runtime repairs; retired when the run ends (settle/complete/stop paths).
    yield* Effect.promise(() => stepActivities.emitResolved(authorStepId, "completed"));
    return;
  }
  // Unfixable, or the author ran out of time (the failure funnel below retires the author thread): ONE failure, through the run's own terminal funnel.
  const reason =
    outcome.kind === "failed"
      ? outcome.error instanceof Error
        ? outcome.error.message
        : String(outcome.error)
      : outcome.reply.trim().length > 0
        ? `The orchestration could not be authored: ${outcome.reply.trim().slice(0, 240)}`
        : "The orchestration could not be authored: the author ended without producing a source.";
  // The session stays registered (with nothing waiting): the author thread must never fall
  // through to launching a NEW run, and a late submission is refused by name.
  yield* Effect.promise(() => stepActivities.emitResolved(authorStepId, "failed", reason));
  yield* Effect.promise(() =>
    settleWorkflowRunFailure({
      runId: input.runId,
      launchThreadId: input.launchThreadId,
      error: new Error(reason),
      registry: launch.registry,
      lifecycle,
      stepActivities,
      host: launch.host,
      onError: input.onError,
      phase: "launch",
      hostOwnsSource: true,
    }),
  );
});
