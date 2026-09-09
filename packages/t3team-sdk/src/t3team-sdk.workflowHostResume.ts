/** The retry-safe reply journal + replay half of a workflow run host. */

import { resumeWorkflow } from "./t3team-sdk.engine.ts";

import type { WorkflowRef, WorkflowRunOptions } from "./t3team-sdk.types.ts";
import type {
  WorkflowHostLifecycle,
  WorkflowHostRegistry,
  WorkflowLaunchStatus,
} from "./t3team-sdk.workflowHostTypes.ts";

export async function resumeWorkflowRunHost(input: {
  readonly runId: string;
  readonly correlationId: string;
  readonly reply: unknown;
  readonly ref: WorkflowRef;
  readonly args: unknown;
  readonly runOptions: WorkflowRunOptions;
  readonly registry: WorkflowHostRegistry;
  readonly lifecycle: WorkflowHostLifecycle | undefined;
  readonly appendReply: (opts: {
    readonly runId: string;
    readonly correlationId: string;
    readonly reply: unknown;
  }) => Promise<boolean>;
  readonly retryResolvedReply: ((correlationId: string) => Promise<boolean> | boolean) | undefined;
  readonly onReplyJournaled: ((correlationId: string) => Promise<void> | void) | undefined;
  readonly settle: (result: Awaited<ReturnType<typeof resumeWorkflow>>) => Promise<WorkflowLaunchStatus>;
  readonly repairAttempt: (error: unknown) => Promise<boolean>;
  readonly isCancelled: () => boolean;
  readonly onFailed: (detail: { readonly phase: "resume"; readonly error: unknown }) => Promise<void>;
}): Promise<void> {
  const {
    runId,
    correlationId,
    reply,
    ref,
    args,
    runOptions,
    registry,
    lifecycle,
    appendReply,
    retryResolvedReply,
    onReplyJournaled,
    settle,
    repairAttempt,
    isCancelled,
    onFailed,
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
    await settle(await resumeWorkflow(runId, ref, args, runOptions));
  } catch (error) {
    if (registry.getRun(runId) === undefined) return;
    if (await repairAttempt(error)) return;
    if (isCancelled() || registry.getRun(runId) === undefined) return;
    await onFailed({ phase: "resume", error });
  }
}
