import {
  CommandId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationThreadActivityState,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";
import { resolveAuxTextGenerationModelSelection } from "./orchestration/Layers/ProviderCommandReactor.ts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import {
  ACTIVITY_LABEL_MAX_TRACKED_THREADS,
  createActivityLabelEventReactor,
} from "./t3team-activityLabelSummarizer.ts";
import { createActivityStateTracker } from "./t3team-activityState.ts";
import { runtimeEventToActivityStateEvent } from "./t3team-activityStateEvent.ts";
import { createBoundedThreadMap } from "./t3team-boundedThreadMap.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { ServerSettingsService } from "./serverSettings.ts";

/**
 * Live "working on" label reactor for active threads (GHE #40, extended by GHE #208).
 *
 * Two independent writers on the same channel, both fail-open:
 *
 * 1. DETERMINISTIC 4-state base word (GHE #208, always on, zero inference):
 *    a per-thread state machine over the provider runtime event stream
 *    (thinking / writing / working / waiting), persisted as `activityState`
 *    on thread meta on every STATE TRANSITION only — the word updates
 *    instantly. `waiting` fires after `ACTIVITY_STATE_IDLE_GAP_MS` (30s) of
 *    silence with no tool in flight.
 * 2. OPTIONAL LLM free-text enrichment (GHE #40, throttled): a separate, tiny
 *    text-generation request — never a chat message, activity, or provider
 *    turn. Light-inference guarantees (enforced in
 *    `t3team-activityLabelSummarizer.ts` + the `generateActivityLabel` op):
 *    - TINY payload: only the last 5 meaningful activities (kind + short
 *      summary) plus a one-line user-intent gist, hard-capped to ~400 chars.
 *    - NON-thinking: the aux model selection is option-stripped and the op
 *      asks the driver for no reasoning effort / thinking budget.
 *    - THROTTLED SLOWLY: debounced ~20s after the last activity AND at most
 *      once per ~60s (minRegenerateMs); the only immediate trigger is a
 *      coarse state change, which defers into the remaining 60s window.
 *      The deterministic word updates instantly; the detail catches up lazily.
 *    - SKIPPED when the recent-activity window is unchanged since the last
 *      generation; CLEARED on idle/terminal.
 *    - TIME-BOXED (GHE #208 follow-up): a persisted label gets a minimum
 *      life of `ACTIVITY_LABEL_TTL_MS` (5s — PJ's decision: give an LLM
 *      status text a minimum time to live, then let either new LLM text or
 *      the live deterministic state word override it). The clear is
 *      scheduled inside `createActivityLabelSummarizer` after each persist;
 *      a newer label reschedules it, the turn-end clear cancels it, and a
 *      late fire is no-oped by the timer-handle guard. After expiry the
 *      display falls back to the live `activityState` word automatically via
 *      the existing pill precedence. The throttle above (light inference,
 *      slow generation) is untouched.
 *    - Gated by the `t3teamActivityLabelsEnabled` settings flag: off = no LLM
 *      calls, the UI shows just the state word.
 *
 * FAIL-OPEN end to end: on any error the state word stands alone — never a
 * static "Working", never an error state, never a hanging spinner.
 */
export const T3TeamActivityLabelReactorLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const textGeneration = yield* TextGeneration;
    const serverSettingsService = yield* ServerSettingsService;
    const providerService = yield* ProviderService;

    const persistThreadMeta = (
      threadId: string,
      meta:
        | { activityLabel?: string | null }
        | { activityState?: OrchestrationThreadActivityState | null },
    ) =>
      Effect.runPromise(
        engine.dispatch({
          type: "thread.meta.update",
          commandId: CommandId.make(`server:t3team:activity:${t3teamRandomUUID()}`),
          threadId: ThreadId.make(threadId),
          ...meta,
        }),
      ).catch(() => undefined);

    // 1. Deterministic state tracker (GHE #208): always on, persisted on
    //    transitions + the idle-gap promotion only.
    const tracker = createActivityStateTracker({
      persist: async ({ threadId, state }) => {
        await persistThreadMeta(threadId, { activityState: state });
      },
    });

    // The settings flag is toggled from the UI; keep it live so an off-toggle
    // stops generation immediately without a restart. Off now means "no
    // enrichment" — the deterministic state word keeps flowing.
    let activityLabelsEnabled = (yield* serverSettingsService.getSettings)
      .t3teamActivityLabelsEnabled;
    // GHE #208 follow-up: optional env override for the LLM label TTL (the
    // 5s minimum life). Only positive finite ints are honored; anything else
    // falls back to the ACTIVITY_LABEL_TTL_MS default.
    const rawTtl = process.env.T3TEAM_ACTIVITY_LABEL_TTL_MS;
    const parsedTtl = rawTtl === undefined ? NaN : Number.parseInt(rawTtl, 10);
    const activityLabelTtlMs = Number.isFinite(parsedTtl) && parsedTtl >= 0 ? parsedTtl : undefined;
    // The settings stream is a live, never-ending PubSub stream. It MUST be
    // forked into the layer scope, not `yield*`ed inline: `yield*` on a stream
    // that never completes would block this reactor effect forever, so the two
    // stream subscriptions below (the deterministic state word + the domain
    // event handlers) would never start and the working row would be stuck on
    // its "Working" fallback. (GHE #208 regression.)
    yield* Effect.forkScoped(
      serverSettingsService.streamChanges.pipe(
        Stream.runForEach((settings) => {
          activityLabelsEnabled = settings.t3teamActivityLabelsEnabled;
          return Effect.void;
        }),
      ),
    );

    // 2. LLM enrichment (GHE #40): throttled, gated, fail-open.
    // One-line user-intent gist, captured from user messages (no thread read).
    // GHE #203: bounded so a stream of never-idling threads cannot grow this
    // unboundedly; the normal, immediate prune is thread.deleted below.
    const userGistByThread = createBoundedThreadMap<string>(ACTIVITY_LABEL_MAX_TRACKED_THREADS);

    const reactor = createActivityLabelEventReactor({
      loadThread: async (threadId) => {
        const shell = await Effect.runPromise(
          query
            .getThreadShellById(ThreadId.make(threadId))
            .pipe(Effect.orElseSucceed(() => Option.none())),
        );
        const thread = Option.getOrUndefined(shell);
        if (!thread) return null;
        return {
          modelSelection: resolveAuxTextGenerationModelSelection(
            await Effect.runPromise(serverSettingsService.getSettings),
            thread.modelSelection,
          ),
          userGist: userGistByThread.get(threadId) ?? null,
        };
      },
      generate: async ({ modelSelection, context }) => {
        const operation = textGeneration.generateActivityLabel;
        if (!operation) return null; // fail-open: this host has no label-capable driver
        const result = await Effect.runPromise(
          operation({
            cwd: process.cwd(),
            context,
            modelSelection,
          }),
        );
        return result.label;
      },
      persist: async ({ threadId, label }) => {
        await persistThreadMeta(threadId, { activityLabel: label });
      },
      isActive: () => activityLabelsEnabled === true,
      onError: (cause) => {
        Effect.runFork(Effect.logWarning("activity label summarizer timer failed", { cause }));
      },
      // GHE #208 follow-up: the label TTL defaults to ACTIVITY_LABEL_TTL_MS
      // (5s); a numeric env override exists to shorten it for e2e tests
      // (0 disables the timer — the label then lives until the next
      // generation or the turn-end clear).
      ...(activityLabelTtlMs !== undefined ? { activityLabelTtlMs } : {}),
    });

    const onActivity = (event: OrchestrationEvent) =>
      Effect.gen(function* () {
        if (event.type !== "thread.activity-appended") return;
        const activity = event.payload.activity;
        // Handoffs and approval/user-input rows are coordination state, not work
        // in progress — they would skew the "what is it doing now" label.
        if (activity.kind === "t3team.handoff.created" || activity.kind === "approval.requested") {
          return;
        }
        yield* Effect.promise(() =>
          reactor.handle({
            threadId: event.payload.threadId,
            kind: activity.kind,
            summary: activity.summary,
            activityState: tracker.stateOf(event.payload.threadId),
          }),
        );
      });

    const onUserMessage = (event: OrchestrationEvent) =>
      Effect.gen(function* () {
        if (event.type !== "thread.message-sent") return;
        if (event.payload.role !== "user") return;
        const text = event.payload.text.trim().replace(/\s+/g, " ");
        if (text.length > 0) {
          userGistByThread.set(event.payload.threadId, text.slice(0, 100));
        }
      });

    // GHE #203: userGistByThread (here) and windowByThread (inside the
    // summarizer) were only ever pruned on idle — a thread that is deleted
    // without going idle first (killed process, crashed provider) leaked
    // both forever. Prune eagerly on the thread-deleted domain event.
    const onThreadDeleted = (event: OrchestrationEvent) =>
      Effect.gen(function* () {
        if (event.type !== "thread.deleted") return;
        userGistByThread.delete(event.payload.threadId);
        yield* Effect.sync(() => reactor.forget(event.payload.threadId));
      });

    const onIdle = (event: OrchestrationEvent) =>
      Effect.gen(function* () {
        // Turn ended, the thread settled into the shelf, or the user stopped
        // the turn: both the state word and the live label are done — clear
        // them so they never render stale on the next activation.
        const threadId =
          event.type === "thread.turn-diff-completed" ||
          event.type === "thread.settled" ||
          event.type === "thread.turn-interrupt-requested"
            ? event.payload.threadId
            : null;
        if (threadId === null) return;
        yield* Effect.all([
          Effect.promise(() => tracker.clear(threadId)),
          Effect.promise(() => reactor.clear(threadId)),
        ]);
      });

    // The runtime stream drives BOTH the deterministic state machine and the
    // coarse-change detection for the throttled LLM path.
    const onRuntimeEvent = (event: Parameters<typeof runtimeEventToActivityStateEvent>[0]) =>
      Effect.gen(function* () {
        const stateEvent = runtimeEventToActivityStateEvent(event);
        if (!stateEvent) return;
        yield* Effect.sync(() => tracker.note(stateEvent));
      });

    yield* Effect.forkScoped(
      Stream.runForEach(providerService.streamEvents, (event) =>
        Effect.gen(function* () {
          yield* onRuntimeEvent(event);
        }).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.logWarning("activity state runtime event failed", {
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
          ),
        ),
      ),
    );

    yield* Effect.forkScoped(
      Stream.runForEach(engine.streamDomainEvents, (event) =>
        Effect.gen(function* () {
          yield* onUserMessage(event);
          yield* onIdle(event);
          yield* onActivity(event);
          yield* onThreadDeleted(event);
        }).pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.logWarning("activity label reactor event failed", {
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
          ),
        ),
      ),
    );
  }),
);
