/**
 * Thread provider-usage hold control route (GHE #421, auto-resume layer).
 *
 * Two surfaces:
 *
 *  • `POST /api/t3team/thread/provider-hold/control` — the per-thread
 *    auto-resume toggle the banner below the latest message calls. Flips the
 *    user-owned `auto_resume` flag on the thread's active hold row and emits
 *    a `provider.usage-hold.auto-resume-set` activity so connected clients
 *    update the banner without a refetch.
 *
 *  • `POST /api/t3team/provider-usage/dev-force` +
 *    `GET  /api/t3team/provider-usage/dev-state` — dev hooks that run the
 *    watcher's exact act/release paths with a synthetic exhausted sample, so
 *    the pause → banner → toggle → auto-resume cycle can be verified live
 *    without burning a real subscription window. Off unless
 *    `T3TEAM_PROVIDER_USAGE_DEV_FORCE=1`.
 *
 * @module t3team-thread-provider-hold-route
 */
import { CommandId, EventId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { HttpRouter } from "effect/unstable/http";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProviderUsageHoldRepository } from "./persistence/Services/t3team-ProviderUsageHolds.ts";
import {
  PROVIDER_USAGE_HOLD_ACTIVITY_KINDS,
  ProviderUsageWatcher,
} from "./t3team-providerUsageWatcher.ts";
import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { nowIso } from "./t3team-thread-recipe-workflow-routes-resolve.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const DEV_FORCE_DISABLED =
  "Provider usage dev hooks are disabled (set T3TEAM_PROVIDER_USAGE_DEV_FORCE=1 to enable).";

/** The per-thread auto-resume toggle (banner switch). */
export const t3teamThreadProviderHoldControlRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/provider-hold/control",
  Effect.gen(function* () {
    const input = yield* readJsonBody<{ readonly threadId?: string; readonly autoResume?: boolean }>();
    const threadId = input.threadId?.trim() ?? "";
    if (!threadId || typeof input.autoResume !== "boolean") {
      return yield* new T3TeamAtlassianError({
        message: "threadId and a boolean autoResume are required.",
      });
    }
    const holds = yield* ProviderUsageHoldRepository;
    const engine = yield* OrchestrationEngineService;
    const updated = yield* holds
      .setAutoResume({
        threadId: ThreadId.make(threadId),
        autoResume: input.autoResume,
        now: nowIso(),
      })
      .pipe(Effect.map((option) => (Option.isSome(option) ? option.value : null)));
    if (updated === null) {
      return okJson({ ok: true, updated: false });
    }
    yield* engine
      .dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(t3teamRandomUUID()),
        threadId: ThreadId.make(threadId),
        activity: {
          id: EventId.make(t3teamRandomUUID()),
          tone: "info",
          kind: PROVIDER_USAGE_HOLD_ACTIVITY_KINDS.autoResumeSet,
          summary: input.autoResume
            ? "Auto-resume enabled — this thread resumes when the provider window resets"
            : "Auto-resume disabled — this thread stays paused until you resume it",
          payload: { autoResume: input.autoResume },
          turnId: null,
          createdAt: nowIso(),
        },
        createdAt: nowIso(),
      })
      .pipe(Effect.catchCause(() => Effect.void));
    return okJson({ ok: true, updated: true });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to update the provider-usage hold.")),
    Effect.catch(errorResponse),
  ),
);

interface DevForceInput {
  readonly mode?: "exhaust" | "recover";
  readonly provider?: string;
  readonly providerInstanceId?: string;
  readonly resetsInMs?: number;
  readonly threadId?: string;
}

/** Dev hooks: force the exhausted/recovered state through the real act/release paths. */
export const t3teamProviderUsageDevRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/provider-usage/dev-force",
  Effect.gen(function* () {
    const input = yield* readJsonBody<DevForceInput>();
    const watcher = yield* ProviderUsageWatcher;
    if (input.mode === "recover") {
      const result = yield* watcher.forceRecover().pipe(
        Effect.mapError((error) => new T3TeamAtlassianError({ message: error.message })),
      );
      return okJson({ ok: true, ...result });
    }
    const result = yield* watcher
      .forceExhaust({
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.providerInstanceId !== undefined
          ? { providerInstanceId: input.providerInstanceId }
          : {}),
        ...(input.resetsInMs !== undefined ? { resetsInMs: input.resetsInMs } : {}),
        ...(input.threadId !== undefined ? { threadId: input.threadId } : {}),
      })
      .pipe(Effect.mapError((error) => new T3TeamAtlassianError({ message: error.message })));
    return okJson({ ok: true, ...result });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to force the provider-usage state.")),
    Effect.catch(errorResponse),
  ),
);

/** Dev hook: current held state (in-memory + persisted rows). */
export const t3teamProviderUsageDevStateRouteLayer = HttpRouter.add(
  "GET",
  "/api/t3team/provider-usage/dev-state",
  Effect.gen(function* () {
    const watcher = yield* ProviderUsageWatcher;
    const state = yield* watcher.getDevState();
    if (state.held.length === 0 && state.holds.length === 0) {
      // Nothing held: make the disabled-state visible so a misconfigured curl
      // is not mistaken for "enabled but idle".
      const settingsGate =
        process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "1" ||
        process.env["T3TEAM_PROVIDER_USAGE_DEV_FORCE"] === "true";
      if (!settingsGate) {
        return yield* new T3TeamAtlassianError({ message: DEV_FORCE_DISABLED });
      }
    }
    return okJson({ ok: true, ...state });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to read the provider-usage state.")),
    Effect.catch(errorResponse),
  ),
);
