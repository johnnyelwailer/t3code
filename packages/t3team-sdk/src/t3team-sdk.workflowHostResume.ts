/** The replay half of a workflow run host: retry-safe reply journal + resume (including a resume
 * that lands while another drive runs), and the reply-less re-drive (optionally re-firing one
 * recorded ask). */

import { resumeWorkflow } from "./t3team-sdk.engine.ts";

import type { WorkflowRef, WorkflowRunOptions } from "./t3team-sdk.types.ts";
import type { WorkflowHostDriveSlot } from "./t3team-sdk.workflowHostDriveSlot.ts";
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

/** One reply to journal, plus the host seams that decide what a duplicate write means. */
export interface WorkflowReplyInput {
  readonly runId: string;
  readonly correlationId: string;
  readonly reply: unknown;
  readonly appendReply: (opts: {
    readonly runId: string;
    readonly correlationId: string;
    readonly reply: unknown;
  }) => Promise<boolean>;
  readonly retryResolvedReply: ((correlationId: string) => Promise<boolean> | boolean) | undefined;
  readonly onReplyJournaled: ((correlationId: string) => Promise<void> | void) | undefined;
}

/**
 * Journal one reply. `"journaled"` — written now, or already present and the host declares it
 * retry-safe (`onReplyJournaled` has run); `"duplicate"` — already present and not retry-safe.
 * Throws when the journal stays unreachable after the one retry.
 */
export async function journalReply(input: WorkflowReplyInput): Promise<"journaled" | "duplicate"> {
  const { runId, correlationId, reply, appendReply } = input;
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
  // The host distinguishes retry-safe user input from a clock wake whose
  // previous process died after journaling its reply.
  if (!wrote && !(await input.retryResolvedReply?.(correlationId))) return "duplicate";
  await input.onReplyJournaled?.(correlationId);
  return "journaled";
}

/**
 * A resume that arrived while another drive holds `slot`: journal the reply NOW so it cannot be
 * lost, and owe the in-flight drive one replay. If the journal is unreachable, owe the whole
 * resume instead — it retries the write after the current drive and reports a persistent
 * failure through the normal resume funnel. Resolves once the reply is journaled (or owed).
 */
export async function resumeWhileBusy(input: {
  readonly slot: WorkflowHostDriveSlot;
  readonly reply: WorkflowReplyInput;
  readonly resumeDrive: () => Promise<void>;
  readonly replayDrive: () => Promise<void>;
  readonly canDrive: () => boolean;
}): Promise<void> {
  const { slot, resumeDrive, replayDrive } = input;
  let journaled: boolean;
  try {
    journaled = (await journalReply(input.reply)) === "journaled";
  } catch {
    if (slot.busy()) return slot.oweDrive(resumeDrive);
    return input.canDrive() ? slot.run(resumeDrive) : undefined;
  }
  if (!journaled) return; // already answered and not retry-safe: the live drive has it
  if (slot.busy()) return slot.oweReplay(replayDrive);
  // The drive settled while the reply was being written: replay it ourselves.
  if (input.canDrive()) return slot.run(replayDrive);
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
