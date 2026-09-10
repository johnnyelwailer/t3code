/**
 * Re-surfacing the terminal failure notice of a run its launch thread buried.
 *
 * Live incident: a run failed 30 ms after launch; the notice was upserted into the launch
 * thread WHILE the launch turn was still active, so it landed inside the turn — the agent
 * kept going ("Killed that job…"), the turn ended 4 s later, and the failure sat unseen in
 * the transcript for 40 minutes until the user opened the card. The notice was never lost
 * (one stable per-run message id); it was just never re-anchored AFTER the turn.
 *
 * This module watches the launch thread's session events. When a thread transitions from
 * busy (a turn running) to idle, the terminal failure notice of the most recent run it
 * launched — if that run failed within {@link RECENT_FAILURE_WINDOW_MS} — is re-posted under
 * its stable per-run message id with a fresh timestamp. The re-post is idempotent (same
 * text, same message id), happens at most once per run per uptime, and never starts an
 * agent turn: it only guarantees the thread's own transcript shows the outcome after the
 * turn that launched it.
 *
 * Scope is deliberately failures only: a completion's output is not persisted on the run
 * row, so it cannot be re-built from the reactor — and a green card is less urgent to
 * re-anchor than a buried red one.
 */
import type {
  OrchestrationCommand,
  OrchestrationSession,
  OrchestrationEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { WorkflowRunRepositoryShape } from "./persistence/Services/WorkflowRuns.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  buildWorkflowFailureText,
  postWorkflowTerminalNotice,
} from "./t3team-workflowCompletionMessage.ts";

/** A failure older than this is history, not a live "did that just die?" question. */
export const RECENT_FAILURE_WINDOW_MS = 30 * 60 * 1000;

export type TerminalNoticeResurfer = {
  /** Feed a `thread.session-set` event; re-posts at most one buried notice per idle transition. */
  readonly onSessionSet: (
    event: Extract<OrchestrationEvent, { type: "thread.session-set" }>,
  ) => Effect.Effect<void, never, never>;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function makeTerminalNoticeResurfer(input: {
  readonly runRepo: WorkflowRunRepositoryShape;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly nowIso: () => string;
  /** Wall-clock milliseconds; injected so the effect itself never touches the global clock. */
  readonly nowMs: () => number;
}): TerminalNoticeResurfer {
  // Uptime-scoped: a server restart forgets which threads it last saw busy, and a failure
  // older than the window no longer qualifies anyway.
  const lastSeenBusy = new Map<string, boolean>();
  const resurfaced = new Set<string>();

  // A turn is "busy" while it is starting OR running; every other session status is idle. The
  // busy→idle edge is the launch-turn-ended signal that re-anchors a buried terminal notice.
  const isBusy = (session: OrchestrationSession) =>
    session.status === "running" || session.status === "starting" || session.activeTurnId !== null;

  const resurfaceMostRecent = Effect.fn("resurfaceMostRecent")(function* (threadId: string) {
    const rows = yield* input.runRepo
      .listRecent({ limit: 25 })
      .pipe(
        Effect.mapError((error) => `could not list recent workflow runs: ${errorMessage(error)}`),
      );
    for (const row of rows) {
      if (row.launchThreadId !== threadId || row.status !== "failed") continue;
      if (resurfaced.has(row.runId)) continue;
      const failedAt = Date.parse(row.updatedAt);
      if (!Number.isFinite(failedAt)) continue;
      if (input.nowMs() - failedAt > RECENT_FAILURE_WINDOW_MS) continue;
      resurfaced.add(row.runId);
      // Rebuilt from the persisted (already sanitized) failure reason — the same stable
      // message id the original notice used, so the upsert re-anchors it, not duplicates it.
      yield* Effect.promise(() =>
        postWorkflowTerminalNotice({
          launchThreadId: threadId,
          workflowRunId: row.runId,
          kind: "failed",
          text: buildWorkflowFailureText({
            errorText: row.failureReason ?? "",
            hostOwnsSource: row.origin === "ephemeral",
            resumable: row.pendingKind !== null,
          }),
          dispatch: input.dispatch,
          newId: () => t3teamRandomUUID(),
          nowIso: input.nowIso,
        }),
      ).pipe(Effect.mapError((error) => `terminal notice re-post failed: ${errorMessage(error)}`));
      return; // one re-surface per idle transition — the most recent eligible failure
    }
  });

  return {
    onSessionSet: (event) =>
      Effect.gen(function* () {
        const threadId = String(event.payload.threadId);
        const nowBusy = isBusy(event.payload.session);
        const wasBusy = lastSeenBusy.get(threadId) ?? false;
        lastSeenBusy.set(threadId, nowBusy);
        // Only a busy→idle transition re-anchors: idle session churn (reconnects, metadata)
        // must not re-post. A thread we never saw busy this uptime gets no re-post — without
        // the busy half we cannot tell "the launch turn ended" from "the thread was always
        // idle" (the failure may have been noticed already).
        if (wasBusy && !nowBusy) yield* resurfaceMostRecent(threadId);
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("t3team workflow terminal-notice resurface failed", {
            error: String(error),
          }),
        ),
      ),
  };
}
