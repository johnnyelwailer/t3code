import type { CloudSessionFailedError, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { CloudSessionMachine, CloudSessionMachines } from "./t3team-CloudSessionMachine.ts";
import { logMachineOutcome } from "./t3team-cloudSessionMachineLog.ts";

/** The machine a create runs in, or none; `fallback` says why a project's machine was not used. */
export interface ResolvedCloudSessionMachine {
  readonly machine: CloudSessionMachine | null;
  readonly fallback?: string;
}

/**
 * A project's machine definition is optional (owner decision, 2026-11-13): one that cannot be used
 * (untracked, unpushed, invalid, an origin the session cannot clone) never fails a create when a
 * plain session in the project can start. The create goes on as plain and the session carries the
 * reason, which the clients show as one line. When plain cannot start either, the failure stands.
 */
export const fallBackToPlainOnMachineFailure =
  (machines: CloudSessionMachines["Service"], projectId: ProjectId, brokerEnabled: boolean) =>
  (
    resolve: Effect.Effect<CloudSessionMachine | null, CloudSessionFailedError>,
  ): Effect.Effect<ResolvedCloudSessionMachine, CloudSessionFailedError> =>
    resolve.pipe(
      Effect.map((machine): ResolvedCloudSessionMachine => ({ machine })),
      Effect.catch((failure) =>
        Effect.gen(function* () {
          const plainPossible =
            brokerEnabled &&
            (yield* machines.resolvePlain(projectId).pipe(Effect.option))._tag === "Some";
          yield* logMachineOutcome(projectId, {
            outcome: plainPossible ? "plain_fallback" : "plain_unavailable",
            reason: failure.reason,
          });
          if (!plainPossible) return yield* failure;
          return { machine: null, fallback: failure.message };
        }),
      ),
    );
