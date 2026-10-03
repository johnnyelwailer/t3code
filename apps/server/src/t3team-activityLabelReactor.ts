/**
 * Live "working on …" label for active threads (GHE #40), on V2.
 *
 * Fed from the V2 live domain stream (`streamDomainEvents`, live tail only: a
 * label is a best-effort hint about current work, nothing is replayed after a
 * restart):
 * - finished, meaningful turn items (`turnItemActivity`, shared with the child
 *   status summarizer) note activity into the throttled summarizer;
 * - user messages give the one-line user-intent gist;
 * - a terminal run, a settle or a delete clears the label.
 *
 * The label is written as the thread's `activityLabel` fact (side stream,
 * never chat). The 4-state word (thinking/writing/working/waiting) is no longer
 * computed here: clients derive it from V2 turn items. Gated live by the
 * `t3teamActivityLabelsEnabled` setting; fail-open everywhere.
 * @module t3team-activityLabelReactor
 */
import { type OrchestrationV2DomainEvent, ThreadId } from "@t3tools/contracts";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import {
  isTerminalRunStatus,
  ThreadManagementService,
} from "./orchestration-v2/ThreadManagementService.ts";
import { forkParked } from "./serverActivation.ts";
import { ServerSettingsService } from "./serverSettings.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import { createActivityLabelEventReactor } from "./t3team-activityLabelSummarizer.ts";
import { turnItemActivity } from "./t3team-childStatusSummarizer.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";

/** `T3TEAM_ACTIVITY_LABEL_TTL_MS`: non-negative integer override of the label's minimum life. */
export function parseActivityLabelTtlMs(raw: string | undefined): number | undefined {
  const parsedTtl = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : undefined;
}

const USER_GIST_MAX = 100;

/** Summarizer timing overrides (tests); production uses the summarizer defaults. */
export interface ActivityLabelTiming {
  readonly debounceMs?: number;
  readonly minRegenerateMs?: number;
  readonly activityLabelTtlMs?: number;
}

export const makeT3TeamActivityLabelReactor = (timing: ActivityLabelTiming = {}) =>
  Effect.gen(function* () {
    const threads = yield* ThreadManagementService;
    const textGeneration = yield* TextGeneration;
    const serverSettings = yield* ServerSettingsService;
    const facts = yield* T3TeamThreadFactsStore;
    const generateActivityLabel = textGeneration.generateActivityLabel;
    // Hosts without a label-capable text-generation driver have no labels.
    if (generateActivityLabel === undefined) return;

    let enabled = (yield* serverSettings.getSettings).t3teamActivityLabelsEnabled === true;
    yield* forkParked(
      Stream.runForEach(serverSettings.streamChanges, (settings) =>
        Effect.sync(() => {
          enabled = settings.t3teamActivityLabelsEnabled === true;
        }),
      ),
    );

    const userGistByThread = new Map<string, string>();
    const activityLabelTtlMs =
      timing.activityLabelTtlMs ??
      parseActivityLabelTtlMs(process.env.T3TEAM_ACTIVITY_LABEL_TTL_MS);

    const loadThread = (threadId: string) =>
      Effect.gen(function* () {
        const shell = yield* threads.getThreadShell(ThreadId.make(threadId));
        if (shell === null) return null;
        const settings = yield* serverSettings.getSettings;
        return {
          modelSelection: resolveProjectSettings(settings, shell.projectId).settings
            .textGenerationModelSelection,
          userGist: userGistByThread.get(threadId) ?? null,
        };
      }).pipe(Effect.catchCause(() => Effect.succeed(null)));

    const reactor = createActivityLabelEventReactor({
      loadThread: (threadId) => Effect.runPromise(loadThread(threadId)),
      generate: ({ modelSelection, context }) =>
        Effect.runPromise(
          generateActivityLabel({ cwd: process.cwd(), context, modelSelection }).pipe(
            Effect.map((result) => result.label),
          ),
        ),
      persist: ({ threadId, label }) =>
        Effect.runPromise(
          facts.upsert(ThreadId.make(threadId), { activityLabel: label }).pipe(Effect.ignore),
        ),
      isActive: () => enabled,
      onError: (cause) =>
        Effect.runFork(Effect.logWarning("activity label summarizer failed", { cause })),
      ...(activityLabelTtlMs !== undefined ? { activityLabelTtlMs } : {}),
      ...(timing.debounceMs === undefined ? {} : { debounceMs: timing.debounceMs }),
      ...(timing.minRegenerateMs === undefined ? {} : { minRegenerateMs: timing.minRegenerateMs }),
    });

    const handle = (event: OrchestrationV2DomainEvent): Effect.Effect<void> => {
      switch (event.type) {
        case "turn-item.updated": {
          const activity = turnItemActivity(event.payload);
          if (activity === null) return Effect.void;
          return Effect.promise(() => reactor.handle({ threadId: event.threadId, ...activity }));
        }
        case "message.updated": {
          const message = event.payload;
          if (message.role !== "user" || message.streaming) return Effect.void;
          const gist = message.text.trim().replace(/\s+/g, " ").slice(0, USER_GIST_MAX);
          return Effect.sync(() => {
            if (gist.length > 0) userGistByThread.set(event.threadId, gist);
          });
        }
        case "run.updated":
          return isTerminalRunStatus(event.payload.status)
            ? Effect.promise(() => reactor.clear(event.threadId))
            : Effect.void;
        case "thread.settled":
        case "thread.deleted":
          userGistByThread.delete(event.threadId);
          return Effect.promise(() => reactor.clear(event.threadId));
        default:
          return Effect.void;
      }
    };

    yield* forkParked(
      Stream.runForEach(threads.streamDomainEvents, (event) =>
        handle(event).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.interrupt
              : Effect.logWarning("activity label event failed", {
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
          ),
        ),
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("activity label stream ended", { cause: Cause.pretty(cause) }),
        ),
      ),
    );
  });

export const T3TeamActivityLabelReactorLive = Layer.effectDiscard(makeT3TeamActivityLabelReactor());
