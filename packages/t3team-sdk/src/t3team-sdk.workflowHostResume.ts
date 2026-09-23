/** The replay half of a workflow run host: retry-safe reply journal + resume, and the
 * reply-less re-drive (optionally re-firing one recorded ask). */

import { resumeWorkflow } from "./t3team-sdk.engine.ts";

import type { WorkflowRef, WorkflowRunOptions } from "./t3team-sdk.types.ts";
import type {
  WorkflowHostLifecycle,
  WorkflowHostRegistry,
  WorkflowLaunchStatus,
} from "./t3team-sdk.workflowHostTypes.ts";

/** What every replay drive (resume and redrive) needs: the run, and the settle/failure funnel. */
export interface WorkflowReplayHostInput {
  readonly runId: string;
  readonly ref: WorkflowRef;
  readonly args: unknown;
  readonly runOptions: WorkflowRunOptions;
  readonly registry: WorkflowHostRegistry;
  readonly lifecycle: WorkflowHostLifecycle | undefined;
  readonly settle: (
    result: Awaited<ReturnType<typeof resumeWorkflow>>,
  ) => Promise<WorkflowLaunchStatus>;
  readonly repairAttempt: (error: unknown) => Promise<boolean>;
  readonly isCancelled: () => boolean;
  readonly onFailed: (detail: {
    readonly phase: "resume";
    readonly error: unknown;
  }) => Promise<void>;
}

/**
 * The options one drive runs with. `refire` is scoped to the single `redrive({ refire })` call
 * that asked for it: a `refire` left on the host's static run options is dropped, or it would
 * re-apply to every start, resume and plain redrive of the run.
 */
export function driveOptions(runOptions: WorkflowRunOptions, refire?: string): WorkflowRunOptions {
  const { refire: _static, ...base } = runOptions;
  return refire === undefined ? base : { ...base, refire };
}

/** The shared failure funnel of a replay drive. */
async function failReplay(input: WorkflowReplayHostInput, error: unknown): Promise<void> {
  if (input.registry.getRun(input.runId) === undefined) return;
  if (await input.repairAttempt(error)) return;
  if (input.isCancelled() || input.registry.getRun(input.runId) === undefined) return;
  await input.onFailed({ phase: "resume", error });
}

/** Replay without journaling a reply; with `refire`, re-send that one recorded ask. */
export async function redriveWorkflowRunHost(
  input: WorkflowReplayHostInput & { readonly refire: string | undefined },
): Promise<void> {
  const { runId, ref, args, runOptions, lifecycle, settle, refire } = input;
  try {
    if ((await lifecycle?.recordActive()) === false) return;
    await settle(await resumeWorkflow(runId, ref, args, driveOptions(runOptions, refire)));
  } catch (error) {
    await failReplay(input, error);
  }
}

export async function resumeWorkflowRunHost(
  input: WorkflowReplayHostInput & {
    readonly correlationId: string;
    readonly reply: unknown;
    readonly appendReply: (opts: {
      readonly runId: string;
      readonly correlationId: string;
      readonly reply: unknown;
    }) => Promise<boolean>;
    readonly retryResolvedReply:
      | ((correlationId: string) => Promise<boolean> | boolean)
      | undefined;
    readonly onReplyJournaled: ((correlationId: string) => Promise<void> | void) | undefined;
  },
): Promise<void> {
  const {
    runId,
    correlationId,
    reply,
    ref,
    args,
    runOptions,
    lifecycle,
    appendReply,
    retryResolvedReply,
    onReplyJournaled,
    settle,
  } = input;
  try {
    if ((await lifecycle?.recordActive()) === false) return;
    let wrote: boolean;
    try {
      wrote = await appendReply({ runId, correlationId, reply });
    } catch (firstError) {
      // First-write-wins makes this one retry safe even if the first write
      // committed before a transient transport failure reached the host.
      try {
        wrote = await appendReply({ runId, correlationId, reply });
      } catch {
        throw firstError;
      }
    }
    if (!wrote) {
      // The host distinguishes retry-safe user input from a clock wake whose
      // previous process died after journaling its reply.
      if (!(await retryResolvedReply?.(correlationId))) {
        await lifecycle?.orphanIfSleeping(correlationId);
        return;
      }
    }
    await onReplyJournaled?.(correlationId);
    await settle(await resumeWorkflow(runId, ref, args, driveOptions(runOptions)));
  } catch (error) {
    await failReplay(input, error);
  }
}
