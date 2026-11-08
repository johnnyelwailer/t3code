/**
 * Whether a `remoteEnvironment` turn may run, and where. The thread's own model options only NAME
 * a session (`t3team-remoteEnvironmentTarget.ts`); anything that can write a thread's model
 * selection can write them, so they are never the authorization:
 *
 * - A thread delegate_task placed (`t3team-remoteEnvironmentPlacements.ts`) runs on the session it
 *   was placed on, for the repository key delegate_task derived from its project. Options naming
 *   another session are refused.
 * - After a restart emptied that in-memory registry, a child is re-established only from the
 *   durable, write-once marker delegate_task wrote when it placed it
 *   (`t3team-cloudChildPlacementMarkers.ts`): the marker must name the same session, and that
 *   session must be live in the owner's list. The marker's repository key is the one derived at
 *   placement. A thread without a marker (never placed, whatever its selection was rewritten to)
 *   is refused.
 * - Every turn, the session must be one of the owner's own (the broker's list for this sign-in).
 *
 * The session's own project is then checked against that key before anything runs there
 * (`checkRemoteTarget`).
 */
import type { ProviderAdapterV2TurnInput } from "@t3tools/provider-core/server/ProviderAdapter";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import type { RemoteEnvironmentGrant } from "./t3team-remoteEnvironmentApiTypes.ts";
import type { RemoteEnvironmentPlacementsShape } from "./t3team-remoteEnvironmentPlacements.ts";
import { RemoteEnvironmentRejected } from "./t3team-remoteEnvironmentPrepare.ts";
import { remoteEnvironmentTargetOf } from "./t3team-remoteEnvironmentTarget.ts";

export interface RemoteEnvironmentAuthorizerDeps {
  readonly placements: RemoteEnvironmentPlacementsShape;
  /** The run ids of the owner's own sessions, as the broker lists them for this sign-in. */
  readonly ownSessionIds: Effect.Effect<ReadonlyArray<string>, { readonly message: string }>;
  /** How long a lookup waits for a registration that lands just after the run started. */
  readonly registrationWait?: Duration.Input;
}

const refuse = (message: string) => new RemoteEnvironmentRejected({ reason: "placement", message });

export const makeRemoteEnvironmentAuthorizer = (deps: RemoteEnvironmentAuthorizerDeps) =>
  Effect.fn("RemoteEnvironment.authorize")(function* (turn: ProviderAdapterV2TurnInput) {
    const hint = remoteEnvironmentTargetOf(turn.modelSelection);
    if (hint === undefined) {
      return yield* refuse("This thread's model selection names no cloud session.");
    }
    const registered = yield* deps.placements.lookup(
      turn.threadId,
      deps.registrationWait ?? "15 seconds",
    );
    const placement = registered ?? (yield* deps.placements.marker(turn.threadId));
    if (placement === undefined) {
      return yield* refuse(
        "This thread was not placed on a cloud session by delegate_task on this server, so it does not run on one.",
      );
    }
    if (placement.sessionId !== hint.sessionId) {
      return yield* refuse(
        `This thread was placed on cloud session ${placement.sessionId}, not ${hint.sessionId}.`,
      );
    }
    const own = yield* deps.ownSessionIds.pipe(
      Effect.mapError((error) =>
        refuse(`Could not confirm the cloud session is yours: ${error.message}`),
      ),
    );
    if (!own.includes(placement.sessionId)) {
      return yield* refuse(
        `Cloud session ${placement.sessionId} is not one of your running sessions${registered === undefined ? "; this child's placement could not be re-established after a restart" : ""}.`,
      );
    }
    if (registered === undefined) yield* deps.placements.register(turn.threadId, placement);
    return {
      sessionId: placement.sessionId,
      repositoryKey: placement.repositoryKey,
      modelSelection: hint.modelSelection,
    } satisfies RemoteEnvironmentGrant;
  });
