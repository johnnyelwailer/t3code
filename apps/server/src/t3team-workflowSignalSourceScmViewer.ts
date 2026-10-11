/**
 * The `scm.viewer.change-requests` poller (S5a, over GHE #332's source model): one instance per
 * project, every `WORKFLOW_VIEWER_SIGNAL_POLL_MS` it reads the viewer's open change requests
 * (the digest's host-wide search, `t3team-myworkViewerPrLoader.ts`), reads detail for the ones
 * that could have produced an event, and emits `scm.viewer.change-request.updated` per event.
 *
 * What counts as an event, and why a lost cursor never floods, is in
 * t3team-workflowSignalScmViewerDiff.ts. Delivery follows the Tier A source
 * (t3team-workflowSignalSourceScm.ts): a transient delivery failure holds the cursor so the
 * events re-emit next poll (at-least-once); a source-side emit fault is skipped, because it would
 * never succeed and holding the cursor on it would wedge the instance.
 *
 * Repository scope is the project's own: detail is read WITHOUT a host, which the pull-request
 * service resolves against the project's repository and its linked repositories only, refusing
 * the rest. A refusal is remembered (`unlinked`) so the PR is not asked about again. Known edge:
 * the service matches by owner/name, so a project that owns `acme/api` on one host and links
 * `acme/api` on another has the second host's PRs read as the first's and dropped as `unlinked`.
 */

import { ScmViewerChangeRequestUpdated, type SignalSourceContext } from "@t3team/sdk";
import { ProjectId, type PullRequestDetail, type PullRequestRef } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { isPersistenceSqlError } from "./persistence/Errors.ts";
import type { PullRequestError } from "./pullRequest/PullRequestService.ts";
import type { ViewerPrRead } from "./t3team-myworkViewerPrLoader.ts";
import {
  entriesNeedingDetail,
  isOutOfScopeError,
  parseViewerCursor,
  settleViewerPoll,
  viewerEntryKey,
  type DetailOutcome,
} from "./t3team-workflowSignalScmViewerDiff.ts";
import { makeSignalPollTimer } from "./t3team-workflowSignalSweepTimer.ts";

/** The viewer source's poll cadence: slower than Tier A, since it fans out across searches. */
export const WORKFLOW_VIEWER_SIGNAL_POLL_MS = 120_000;
/** A new registration baselines soon rather than a full interval later. */
const FIRST_POLL_MS = 5_000;
const DETAIL_CONCURRENCY = 4;

/** Share one read between every project's instance: they all ask the same host-wide question. */
export function shareViewerPrRead(
  read: Effect.Effect<ViewerPrRead>,
  ttlMs: number,
): () => Promise<ViewerPrRead> {
  let last: { readonly at: number; readonly value: ViewerPrRead } | undefined;
  let inflight: Promise<ViewerPrRead> | undefined;
  return () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        if (last !== undefined && now - last.at < ttlMs) return last.value;
        inflight ??= Effect.runPromise(read).finally(() => {
          inflight = undefined;
        });
        const pending = inflight;
        const value = yield* Effect.promise(() => pending);
        last = { at: now, value };
        return value;
      }),
    );
}

export function startScmViewerSignalInstance(input: {
  readonly ctx: SignalSourceContext<{ projectId: string }>;
  readonly readViewerPrs: () => Promise<ViewerPrRead>;
  readonly detail: (ref: PullRequestRef) => Effect.Effect<PullRequestDetail, PullRequestError>;
  readonly pollMs: number;
  readonly log: (message: string, fields?: unknown) => void;
}): { readonly stop: () => void; readonly tick: () => Promise<void> } {
  const { ctx, log } = input;
  const projectId = ProjectId.make(ctx.params.projectId);
  const pollTimer = makeSignalPollTimer();
  let stopped = false;

  const readDetail = (entry: Parameters<typeof viewerEntryKey>[0]) =>
    // No `host` on the ref: that is what makes the service hold the read to the project's repositories.
    input.detail({ projectId, repository: entry.repository, number: entry.number }).pipe(
      Effect.map((detail): DetailOutcome => {
        // Hostless, the service matches by owner/name: a same-named repository on another host is not ours.
        return URL.canParse(detail.url) &&
          new URL(detail.url).host.toLowerCase() === entry.host.toLowerCase()
          ? { kind: "detail", detail }
          : { kind: "unlinked" };
      }),
      Effect.catch((error) => {
        if (isOutOfScopeError(error)) return Effect.succeed<DetailOutcome>({ kind: "unlinked" });
        log("scm viewer signal: detail read failed", { error: String(error) });
        return Effect.succeed<DetailOutcome>({ kind: "failed" });
      }),
    );

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const read = await input.readViewerPrs();
      const prev = parseViewerCursor(await ctx.getCursor());
      const outcomes = new Map<string, DetailOutcome>(
        await Effect.runPromise(
          Effect.forEach(
            entriesNeedingDetail(prev, read.entries),
            (entry) =>
              readDetail(entry).pipe(Effect.map((o) => [viewerEntryKey(entry), o] as const)),
            { concurrency: DETAIL_CONCURRENCY },
          ),
        ),
      );
      const { cursor, events } = settleViewerPoll(prev, read, outcomes);
      let allEmitted = true;
      for (const event of events) {
        try {
          await ctx.emit(ScmViewerChangeRequestUpdated, event.key, event.payload);
        } catch (error) {
          if (isPersistenceSqlError(error)) {
            allEmitted = false;
            log("scm viewer signal emit failed (delivery); holding the cursor", {
              key: event.key,
              error: String(error),
            });
            break;
          }
          log("scm viewer signal emit rejected at the delivery boundary; skipping", {
            key: event.key,
            error: String(error),
          });
        }
      }
      if (allEmitted) await ctx.setCursor(JSON.stringify(cursor));
    } catch (error) {
      log("scm viewer signal poll failed", { error: String(error) });
    } finally {
      if (!stopped) pollTimer.schedule(() => void tick(), input.pollMs);
    }
  };

  pollTimer.schedule(() => void tick(), Math.min(input.pollMs, FIRST_POLL_MS));
  return {
    tick,
    stop: () => {
      stopped = true;
      pollTimer.stop();
    },
  };
}
