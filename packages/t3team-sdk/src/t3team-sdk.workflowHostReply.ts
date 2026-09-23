/**
 * The reply-journal half of a workflow run host: write one reply durably (first-write-wins, one
 * retry), classify what an already-present reply means, and — for a resume that lands while
 * another drive holds the slot — decide what that drive owes.
 */

import type { WorkflowHostDriveSlot } from "./t3team-sdk.workflowHostDriveSlot.ts";

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
 * Append one reply to the journal: `true` written now, `false` already present. Throws ONLY when
 * the journal stays unreachable after the one retry — the one failure that means "not durable".
 */
async function appendReplyDurably(input: WorkflowReplyInput): Promise<boolean> {
  const { runId, correlationId, reply, appendReply } = input;
  try {
    return await appendReply({ runId, correlationId, reply });
  } catch (firstError) {
    // First-write-wins makes this one retry safe even if the first write
    // committed before a transient transport failure reached the host.
    try {
      return await appendReply({ runId, correlationId, reply });
    } catch {
      throw firstError;
    }
  }
}

/** Whether a reply `appendReplyDurably` reported may be replayed. The host distinguishes
 * retry-safe user input from a clock wake whose previous process died after journaling it. */
async function replayable(input: WorkflowReplyInput, wrote: boolean): Promise<boolean> {
  return wrote || ((await input.retryResolvedReply?.(input.correlationId)) ?? false);
}

/**
 * Journal one reply. `"journaled"` — written now, or already present and the host declares it
 * retry-safe (`onReplyJournaled` has run); `"duplicate"` — already present and not retry-safe.
 * Throws when the journal stays unreachable after the one retry, or a host seam throws.
 */
export async function journalReply(input: WorkflowReplyInput): Promise<"journaled" | "duplicate"> {
  if (!(await replayable(input, await appendReplyDurably(input)))) return "duplicate";
  await input.onReplyJournaled?.(input.correlationId);
  return "journaled";
}

/**
 * A resume that arrived while another drive holds `slot`: journal the reply NOW so it cannot be
 * lost, and owe the in-flight drive one replay. Resolves once the reply is journaled (or owed).
 *
 * Only an UNREACHABLE journal owes the whole resume (`resumeDrive` retries the write after the
 * current drive and reports a persistent failure through the normal funnel). Once the journal has
 * answered, the reply is durable, so nothing may re-send it: a throwing `onReplyJournaled` owes a
 * drive that `report`s the error once and still replays; a throwing `retryResolvedReply`
 * (durability known, retry-safety not) is reported and replays nothing — as a non-busy resume.
 */
export async function resumeWhileBusy(input: {
  readonly slot: WorkflowHostDriveSlot;
  readonly reply: WorkflowReplyInput;
  readonly resumeDrive: () => Promise<void>;
  readonly replayDrive: () => Promise<void>;
  readonly report: (error: unknown) => Promise<void>;
  readonly canDrive: () => boolean;
}): Promise<void> {
  const { slot, reply, replayDrive, report, canDrive } = input;
  // Hand `drive` to the in-flight drive, or — when it settled meanwhile — run it ourselves.
  const owe = (drive: () => Promise<void>, replays: boolean): Promise<void> | void => {
    if (slot.busy()) return slot.oweDrive(drive, { replays });
    if (canDrive()) return slot.run(drive);
  };
  let wrote: boolean;
  try {
    wrote = await appendReplyDurably(reply);
  } catch {
    return owe(input.resumeDrive, true);
  }
  let retrySafe: boolean;
  try {
    retrySafe = await replayable(reply, wrote);
  } catch (error) {
    return owe(() => report(error), false);
  }
  if (!retrySafe) return; // already answered and not retry-safe: the live drive has it
  try {
    await reply.onReplyJournaled?.(reply.correlationId);
  } catch (error) {
    return owe(async () => {
      await report(error);
      if (canDrive()) await replayDrive();
    }, true);
  }
  if (slot.busy()) return slot.oweReplay(replayDrive);
  if (canDrive()) return slot.run(replayDrive);
}
