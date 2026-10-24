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

import type { RemoteEnvironmentSessionDeps } from "./t3team-remoteEnvironmentApiTypes.ts";

export interface TurnState {
  /** Set once the turn is authorized: the session it runs on. */
  readonly sessionId: Ref.Ref<string | null>;
  readonly runId: Ref.Ref<RunId | null>;
  readonly ended: Deferred.Deferred<void>;
  readonly fiber: Deferred.Deferred<Fiber.Fiber<void>>;
}

/** Interrupts the remote run if one has started; bounded and best effort. */
export const remoteInterrupt = (
  deps: RemoteEnvironmentSessionDeps,
  threadId: ProviderAdapterV2TurnInput["threadId"],
  state: TurnState,
) =>
  Effect.all([Ref.get(state.sessionId), Ref.get(state.runId)]).pipe(
    Effect.flatMap(([sessionId, runId]) =>
      sessionId === null || runId === null
        ? Effect.void
        : Effect.scoped(
            Effect.flatMap(deps.open(sessionId), (api) => api.interruptRun({ threadId, runId })),
          ),
    ),
    Effect.timeout("15 seconds"),
    Effect.ignore,
  );
