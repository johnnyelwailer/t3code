/**
 * Inter-agent restart hold (GHE #155, part c of the #152 umbrella) — the
 * read/build side.
 *
 * A server restart used to rehydrate the actor mailbox and immediately drain
 * every pending inter-agent delivery — one reaction turn per held message,
 * plus one more per crash-interrupted child as the GHE #157 abnormal-stop
 * notifications arrived live after rehydrate. That is the restart flood.
 *
 * The fix is PULL, not push: rehydrate HOLDS the pending work instead of
 * draining it (t3team-actorMailboxRehydrate.ts suppresses the affected
 * threads — those with pending deliveries plus the stale-session set the
 * startup reconcile stops), and when the user CONTINUES a held thread, the
 * actor reactor surfaces the held work as ONE summary turn: the interrupted
 * child threads with their last state, and one line per held message, telling
 * the orchestrator to pull detail and resume as it sees fit. The summary
 * dispatch itself lives in t3team-actorMessageReaction.ts
 * (startActorRestartHoldSummary), whose `t3teamExt.actor.messageIds` names
 * every held delivery so the next restart rehydrate marks the whole batch as
 * already reacted — held work is surfaced exactly once, and the #157
 * abnormal-stop notifications it carries are never double-notified.
 *
 * @module t3team-actorRestartHold
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { T3TeamActorMailboxEntry } from "./t3team-actorMailbox.ts";
import { summarizeActorMessageForDelivery } from "./t3team-actorReactionInput.ts";
import { loadT3TeamThreadDescendants } from "./t3team-threadStopCascade.ts";

/**
 * A child thread that was still running when the server stopped and is now
 * held for the restart summary. `lastState` is the child's last known state
 * (its background child-status, else its session error, else "unknown").
 */
export interface InterruptedChildThread {
  readonly threadId: string;
  readonly title: string;
  readonly lastState: string;
}

/**
 * The session statuses that mark a thread as crash-interrupted at summary
 * time: the startup reconcile (reconcileProviderSessions in
 * serverRuntimeStartup.ts) settles every stale running/starting session with
 * `error` (orphaned provider session), a turn interrupted in place reads
 * `interrupted`, and `stopped` covers the pre-reconcile settle shape.
 */
const INTERRUPTED_SESSION_STATUSES: ReadonlySet<string> = new Set([
  "stopped",
  "interrupted",
  "error",
]);

/**
 * Replay the event log and return the threads whose most recent
 * `thread.session-set` still claims a live session (`running`/`starting`) —
 * exactly the stale set the startup reconcile stops. Those threads'
 * crash-interrupted work (including the #157 abnormal-stop notifications that
 * arrive live AFTER rehydrate) must be held, not auto-drained.
 */
export function collectStaleSessionThreadIdsAtRehydrate(
  events: ReadonlyArray<OrchestrationEvent>,
): ReadonlySet<string> {
  const lastSessionStatus = new Map<string, string>();
  for (const event of events) {
    if (event.type === "thread.session-set") {
      lastSessionStatus.set(event.payload.threadId, event.payload.session.status);
    }
  }
  const stale = new Set<string>();
  for (const [threadId, status] of lastSessionStatus) {
    if (status === "running" || status === "starting") {
      stale.add(threadId);
    }
  }
  return stale;
}

/**
 * Load the descendant threads of `rootThreadId` that stopped abnormally
 * (session `stopped`/`interrupted`) with their last known state. One SQL
 * walk plus one shell read per descendant — no transcript re-reads. The
 * descendant walk already swallows its own failures (returns `[]`), so a
 * missing table degrades the summary to the held-messages section only.
 */
export const loadInterruptedChildThreads = (
  rootThreadId: string,
  query: Pick<ProjectionSnapshotQueryShape, "getThreadShellById">,
): Effect.Effect<ReadonlyArray<InterruptedChildThread>, never, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const descendants = yield* loadT3TeamThreadDescendants(rootThreadId);
    const shells = yield* Effect.forEach(
      descendants,
      (childThreadId) =>
        query
          .getThreadShellById(ThreadId.make(childThreadId))
          .pipe(Effect.orElseSucceed(() => Option.none())),
      { concurrency: "unbounded" },
    );
    const interrupted: InterruptedChildThread[] = [];
    for (const shell of shells) {
      if (Option.isNone(shell)) continue;
      const status = shell.value.session?.status;
      if (status === undefined || !INTERRUPTED_SESSION_STATUSES.has(status)) continue;
      const lastState =
        shell.value.childStatus?.trim() || shell.value.session?.lastError?.trim() || "unknown";
      interrupted.push({ threadId: shell.value.id, title: shell.value.title, lastState });
    }
    return interrupted;
  });

/**
 * Build the restart-hold summary: plain text, one line per held message (each
 * body summarized with its message id via the #154 delivery summarizer, which
 * carries the `t3team_read_message` pull marker for over-long bodies) and one
 * line per interrupted child. Never empty — callers only build it when at
 * least one section has content.
 */
export function buildActorRestartHoldSummary(input: {
  readonly entries: ReadonlyArray<T3TeamActorMailboxEntry>;
  readonly interruptedChildren: ReadonlyArray<InterruptedChildThread>;
}): string {
  const { entries, interruptedChildren } = input;
  const lines: string[] = [
    "[Restart hold — the server restarted while this thread was active; " +
      "auto-reaction of pending work was held back]",
    "",
  ];
  if (interruptedChildren.length > 0) {
    lines.push(
      `${interruptedChildren.length} child thread(s) were interrupted ` +
        "(still running when the server stopped):",
      ...interruptedChildren.map(
        (child) => `- «${child.title}» (thread ${child.threadId}) — last state: ${child.lastState}`,
      ),
      "",
    );
  }
  if (entries.length > 0) {
    lines.push(
      `${entries.length} inter-agent message(s) were pending and were held back ` +
        "from auto-reaction:",
      ...entries.map(
        (entry) =>
          `- [${entry.messageId}] from «${entry.fromTitle}» (thread ${entry.fromThreadId}): ` +
          summarizeActorMessageForDelivery(entry.text, entry.messageId, entry.summary),
      ),
      "",
    );
  }
  lines.push(
    "This is a restart summary, not a new request. Pull detail or resume the " +
      "interrupted child threads as you see fit; to read a held message in full, " +
      "call t3team_read_message with its message id.",
  );
  return lines.join("\n");
}
