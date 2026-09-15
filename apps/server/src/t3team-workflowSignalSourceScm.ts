/**
 * The Tier A built-in sources' poller (GHE #332, design 42 §8): the three
 * `scm.change-request.*` instances over the existing `PullRequestService` — provider-agnostic
 * for free, since that service already spans GitHub / GitLab / Azure DevOps / Bitbucket.
 *
 * Each instance is a bounded POLL: every `WORKFLOW_SIGNAL_POLL_MS` it reads the PR's detail
 * (and activity, for the review instance), diffs against the last observed snapshot
 * (t3team-workflowSignalScmDiff.ts), and emits only the transitions. The snapshot is the
 * durable cursor: `start()` runs again after every restart, and only the cursor bridges the
 * host-down window — a transition observed after the restart is emitted exactly because the
 * cursor remembers the state from before.
 *
 * The cursor's store key is handled by the reconciler (which builds `ctx.getCursor/setCursor`
 * bound to the instance key) — the source never sees the key itself.
 */

import {
  ScmChangeRequestChecksConcluded,
  ScmChangeRequestClosed,
  ScmChangeRequestDraftReady,
  ScmChangeRequestMerged,
  ScmChangeRequestReviewActivity,
  type Signal,
  type SignalSourceContext,
  type SignalSourceInstance,
} from "@t3team/sdk";

import { makeSignalPollTimer } from "./t3team-workflowSignalSweepTimer.ts";
import type { PullRequestActivity, PullRequestDetail, PullRequestRef } from "@t3tools/contracts";
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { PullRequestError } from "./pullRequest/PullRequestService.ts";

import {
  diffScmEvents,
  type ScmSnapshot,
} from "./t3team-workflowSignalScmDiff.ts";

const SIGNALS_BY_NAME: Readonly<Record<string, Signal<unknown>>> = Object.fromEntries(
  [
    ScmChangeRequestMerged,
    ScmChangeRequestClosed,
    ScmChangeRequestDraftReady,
    ScmChangeRequestChecksConcluded,
    ScmChangeRequestReviewActivity,
  ].map((s) => [s.name, s]),
);

/** The built-in sources' poll cadence. */
export const WORKFLOW_SIGNAL_POLL_MS = 30_000;

/** Start one Tier A instance: bounded poll → diff → emit transitions → persist the snapshot
 * as the durable cursor. The returned handle's `stop` clears the poll timer. */
export function startScmSignalInstance(input: {
  readonly ctx: SignalSourceContext<{
    projectId: string;
    repository: string;
    number: number;
  }>;
  readonly detail: (
    ref: PullRequestRef,
  ) => Effect.Effect<PullRequestDetail, PullRequestError>;
  readonly activity?: (
    ref: PullRequestRef,
  ) => Effect.Effect<PullRequestActivity, PullRequestError>;
  readonly pollMs: number;
  readonly log: (message: string, fields?: unknown) => void;
}): SignalSourceInstance {
  const { ctx, detail, pollMs, log } = input;
  const ref: PullRequestRef = {
    projectId: ProjectId.make(ctx.params.projectId),
    repository: ctx.params.repository,
    number: ctx.params.number,
  };
  const key = String(ctx.params.number);

  const pollTimer = makeSignalPollTimer();
  let stopped = false;

  const readCursor = async (): Promise<ScmSnapshot | null> => {
    const raw = await ctx.getCursor();
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as ScmSnapshot;
    } catch {
      return null; // unreadable cursor = baseline again (at most one transition re-emits)
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const [detailNow, activityNow] = await Promise.all([
        Effect.runPromise(detail(ref)).catch((error) => {
          log("scm signal poll: detail read failed", { error: String(error) });
          return null;
        }),
        input.activity === undefined
          ? Promise.resolve(null)
          : Effect.runPromise(input.activity(ref)).catch((error) => {
              log("scm signal poll: activity read failed", { error: String(error) });
              return null;
            }),
      ]);
      if (detailNow !== null) {
        const prev = await readCursor();
        const { events, snapshot } = diffScmEvents(prev, detailNow, activityNow);
        for (const event of events) {
          const signal = SIGNALS_BY_NAME[event.signalName];
          if (signal === undefined) continue;
          // `ctx.emit` is capability-gated + schema-decoded at the host's delivery boundary;
          // an undeclared signal or mistyped payload rejects HERE and is swallowed, not fatal —
          // a poll that keeps failing on its own emit must not kill the poll loop.
          await ctx.emit(signal, key, event.payload).catch(() => {});
        }
        await ctx.setCursor(JSON.stringify(snapshot));
      }
    } finally {
      if (!stopped) pollTimer.schedule(() => void tick(), pollMs);
    }
  };

  pollTimer.schedule(() => void tick(), pollMs);
  return {
    stop: () => {
      stopped = true;
      pollTimer.stop();
    },
  };
}
