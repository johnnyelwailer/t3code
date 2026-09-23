/** The replay half of a workflow run host: resume (journal the reply, then replay) and the
 * reply-less re-drive (optionally re-firing one recorded ask), behind one failure funnel. The
 * reply journal itself lives in `t3team-sdk.workflowHostReply.ts`. */

import { resumeWorkflow } from "./t3team-sdk.engine.ts";

import type { WorkflowRef, WorkflowRunOptions } from "./t3team-sdk.types.ts";
import { createWorkflowHostDriveSlot } from "./t3team-sdk.workflowHostDriveSlot.ts";
import {
  journalReply,
  resumeWhileBusy,
  type WorkflowReplyInput,
} from "./t3team-sdk.workflowHostReply.ts";
import type {
  WorkflowHostLifecycle,
  WorkflowHostRedriveOptions,
  WorkflowHostRegistry,
  WorkflowLaunchStatus,
  WorkflowRunHost,
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
  input: WorkflowReplayHostInput & WorkflowReplyInput,
): Promise<void> {
  const { runId, correlationId, ref, args, runOptions, lifecycle, settle } = input;
  try {
    if ((await lifecycle?.recordActive()) === false) return;
    if ((await journalReply(input)) === "duplicate") {
      await lifecycle?.orphanIfSleeping(correlationId);
      return;
    }
    await settle(await resumeWorkflow(runId, ref, args, driveOptions(runOptions)));
  } catch (error) {
    await failReplay(input, error);
  }
}

/**
 * The host's `resume` and `redrive` entry points over ONE drive slot (see the serialization note
 * on `WorkflowRunHost`): a resume on a free slot journals and replays; on a busy slot it journals
 * and owes the in-flight drive a replay (`resumeWhileBusy`); a busy redrive is dropped.
 */
export function createWorkflowReplayEntryPoints(input: {
  readonly funnel: WorkflowReplayHostInput;
  readonly seams: Omit<WorkflowReplyInput, "runId" | "correlationId" | "reply">;
}): Pick<WorkflowRunHost, "resume" | "redrive"> {
  const { funnel, seams } = input;
  const { runId, registry } = funnel;
  const canDrive = () => !funnel.isCancelled() && registry.getRun(runId) !== undefined;
  const slot = createWorkflowHostDriveSlot(canDrive);
  const replayDrive = () => redriveWorkflowRunHost({ ...funnel, refire: undefined });

  const resume = async (correlationId: string, reply: unknown): Promise<void> => {
    if (registry.getRun(runId) === undefined) return;
    const ownReply = { ...seams, runId, correlationId, reply };
    if (!slot.busy()) return slot.run(() => resumeWorkflowRunHost({ ...funnel, ...ownReply }));
    if (funnel.isCancelled()) return; // a stopped run takes no new work, owed or otherwise
    return resumeWhileBusy({
      slot,
      reply: ownReply,
      // Owed only when this resume's own append failed: an append that failed but still
      // committed makes the retry find THIS reply already present — safe to replay, never an orphan.
      resumeDrive: () =>
        resumeWorkflowRunHost({ ...funnel, ...ownReply, retryResolvedReply: () => true }),
      replayDrive,
      report: (error) => failReplay(funnel, error),
      canDrive,
    });
  };

  // A host-initiated retry: dropped while another drive is in flight (the host retries it).
  const redrive = async (opts?: WorkflowHostRedriveOptions): Promise<void> => {
    if (registry.getRun(runId) === undefined || slot.busy()) return;
    return slot.run(() => redriveWorkflowRunHost({ ...funnel, refire: opts?.refire }));
  };

  return { resume, redrive };
}
