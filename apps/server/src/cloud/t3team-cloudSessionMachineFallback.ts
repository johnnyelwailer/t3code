import { CloudSessionFailedError, type ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { CloudSessionMachine, CloudSessionMachines } from "./t3team-CloudSessionMachine.ts";
import { logMachineOutcome } from "./t3team-cloudSessionMachineLog.ts";
import type { CloudSessionPlainProject } from "./t3team-cloudSessionPlainProject.ts";

/**
 * The machine a create runs in, or none. On a fallback, `plain` is the project the plain session
 * runs in (null: no project, as a build without the broker has) and `fallback` says why the
 * project's machine was not used.
 */
export type ResolvedCloudSessionMachine =
  | { readonly machine: CloudSessionMachine | null }
  | {
      readonly machine: null;
      readonly plain: CloudSessionPlainProject | null;
      readonly fallback: string;
    };

/** A machine or a machine setup in a build without the broker. */
export const machineNeedsBroker = () =>
  new CloudSessionFailedError({
    reason: "machine_unavailable",
    message:
      "Project machines need the cloud-session broker and its account sign-in, which this build does not have.",
  });

/**
 * A machine definition is optional: one that cannot be used (untracked, invalid, a failing chosen
 * source, no broker) never fails a create. It goes on as plain, carrying the reason the clients
 * show. Only with the broker, when a plain session in the project cannot start, the failure stands.
 */
export const fallBackToPlainOnMachineFailure =
  (machines: CloudSessionMachines["Service"], projectId: ProjectId, brokerEnabled: boolean) =>
  (
    resolve: Effect.Effect<CloudSessionMachine | null, CloudSessionFailedError>,
  ): Effect.Effect<ResolvedCloudSessionMachine, CloudSessionFailedError> =>
    resolve.pipe(
      Effect.flatMap((machine) =>
        machine === null || brokerEnabled
          ? Effect.succeed<ResolvedCloudSessionMachine>({ machine })
          : Effect.fail(machineNeedsBroker()),
      ),
      Effect.catch((failure) =>
        Effect.gen(function* () {
          const plain = brokerEnabled
            ? yield* machines.resolvePlain(projectId).pipe(Effect.option)
            : null;
          const plainPossible = plain === null || plain._tag === "Some";
          yield* logMachineOutcome(projectId, {
            outcome: plainPossible ? "plain_fallback" : "plain_unavailable",
            reason: failure.reason,
          });
          if (plain !== null && plain._tag === "None") return yield* failure;
          return {
            machine: null,
            plain: plain === null ? null : plain.value,
            fallback: failure.message,
          } satisfies ResolvedCloudSessionMachine;
        }),
      ),
    );
