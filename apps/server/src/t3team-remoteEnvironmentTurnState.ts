/**
 * The handles of one running turn of a `remoteEnvironment` session, and the one thing done with
 * them from outside the follower: asking the cloud session to interrupt the turn's remote run.
 */
import type { RunId } from "@t3tools/contracts";
import type { ProviderAdapterV2TurnInput } from "@t3tools/provider-core/server/ProviderAdapter";
import type * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import type * as Fiber from "effect/Fiber";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";

import type { RemoteEnvironmentSessionDeps } from "./t3team-remoteEnvironmentApiTypes.ts";

export interface TurnState {
  readonly runId: Ref.Ref<RunId | null>;
  readonly ended: Deferred.Deferred<void>;
  readonly fiber: Deferred.Deferred<Fiber.Fiber<void>>;
}

/** Interrupts the remote run if one has started; bounded and best effort. */
export const remoteInterrupt = (
  deps: RemoteEnvironmentSessionDeps,
  sessionId: string,
  threadId: ProviderAdapterV2TurnInput["threadId"],
  state: TurnState,
) =>
  Ref.get(state.runId).pipe(
    Effect.flatMap((runId) =>
      runId === null
        ? Effect.void
        : Effect.scoped(
            Effect.flatMap(deps.open(sessionId), (api) => api.interruptRun({ threadId, runId })),
          ),
    ),
    Effect.timeout("15 seconds"),
    Effect.ignore,
  );

/** A session still starting is waited for, about 15 minutes at the default interval. */
const READINESS_ATTEMPTS = 90;

/** Connects once the session is reachable; fails as soon as it ended or cannot be reached. */
export const awaitSessionReady = (deps: RemoteEnvironmentSessionDeps, sessionId: string) =>
  Effect.scoped(Effect.asVoid(deps.open(sessionId))).pipe(
    Effect.retry({
      times: deps.readinessAttempts ?? READINESS_ATTEMPTS,
      schedule: Schedule.spaced(deps.readinessInterval ?? "10 seconds"),
      while: (error) =>
        error._tag === "CloudSessionFailedError" && error.reason === "unknown_session",
    }),
  );
