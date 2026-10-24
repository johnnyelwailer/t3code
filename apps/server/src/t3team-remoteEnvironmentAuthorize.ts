/**
 * Whether a `remoteEnvironment` turn may run, and where. The thread's own model options only NAME
 * a session (`t3team-remoteEnvironmentTarget.ts`); anything that can write a thread's model
 * selection can write them, so they are never the authorization:
 *
 * - A thread delegate_task placed (`t3team-remoteEnvironmentPlacements.ts`) runs on the session it
 *   was placed on, for the repository key delegate_task derived from its project. Options naming
 *   another session are refused.
 * - Any other thread is refused, except a delegated child (a `subagent`) after a restart emptied
 *   the registry: its repository key is derived again from its own checkout on this server, and
 *   the placement is re-registered once the checks pass.
 * - Every turn, the session must be one of the owner's own (the broker's list for this sign-in).
 *
 * The session's own project is then checked against the derived key before anything runs there
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
  /** The repository grouping key of a checkout on this server, or null when it has none. */
  readonly repositoryKeyOf: (cwd: string) => Effect.Effect<string | null>;
  /** How long a lookup waits for a registration that lands just after the run started. */
  readonly registrationWait?: Duration.Input;
}

const refuse = (message: string) => new RemoteEnvironmentRejected({ reason: "placement", message });

export const makeRemoteEnvironmentAuthorizer =
  (deps: RemoteEnvironmentAuthorizerDeps) => (turn: ProviderAdapterV2TurnInput) =>
    Effect.gen(function* () {
      const hint = remoteEnvironmentTargetOf(turn.modelSelection);
      if (hint === undefined) {
        return yield* refuse("This thread's model selection names no cloud session.");
      }
      const registered = yield* deps.placements.lookup(
        turn.threadId,
        deps.registrationWait ?? "15 seconds",
      );
      if (registered !== undefined && registered.sessionId !== hint.sessionId) {
        return yield* refuse(
          `This thread was placed on cloud session ${registered.sessionId}, not ${hint.sessionId}.`,
        );
      }
      if (registered === undefined && turn.appThread.lineage.relationshipToParent !== "subagent") {
        return yield* refuse(
          "This thread was not placed on a cloud session by delegate_task on this server, so it does not run on one.",
        );
      }
      const cwd = turn.runtimePolicy.cwd;
      const repositoryKey =
        registered?.repositoryKey ?? (cwd === null ? null : yield* deps.repositoryKeyOf(cwd));
      if (repositoryKey === null) {
        return yield* refuse(
          "This child's cloud placement could not be re-established after a restart: its checkout has no repository identity on this server. Delegate it again.",
        );
      }
      const own = yield* deps.ownSessionIds.pipe(
        Effect.mapError((error) =>
          refuse(`Could not confirm the cloud session is yours: ${error.message}`),
        ),
      );
      if (!own.includes(hint.sessionId)) {
        return yield* refuse(
          `Cloud session ${hint.sessionId} is not one of your running sessions${registered === undefined ? "; this child's placement could not be re-established after a restart" : ""}.`,
        );
      }
      if (registered === undefined) {
        yield* deps.placements.register(turn.threadId, {
          sessionId: hint.sessionId,
          repositoryKey,
        });
      }
      return {
        sessionId: hint.sessionId,
        repositoryKey,
        modelSelection: hint.modelSelection,
      } satisfies RemoteEnvironmentGrant;
    });
