import { CloudSessionFailedError, type ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { CloudSessionMachines } from "./t3team-CloudSessionMachine.ts";
import { logMachineOutcome } from "./t3team-cloudSessionMachineLog.ts";

const OFFER = " A plain session in this project can start instead.";

/**
 * A project machine that cannot be used (unpushed commit, uncommitted definition, an origin the
 * session cannot clone, a missing sign-in) must not dead-end the create when a plain session in the
 * project is possible. The failure still goes back, untouched but for `plainAvailable: true` and one
 * sentence saying so; the client retries with `plain: true` when the user agrees. Nothing is
 * downgraded silently, and when plain is not possible either the failure goes back as it was.
 */
export const offerPlainOnMachineFailure =
  (machines: CloudSessionMachines["Service"], projectId: ProjectId, brokerEnabled: boolean) =>
  <A>(resolve: Effect.Effect<A, CloudSessionFailedError>) =>
    resolve.pipe(
      Effect.catch((failure) =>
        Effect.gen(function* () {
          const plainPossible =
            brokerEnabled &&
            (yield* machines.resolvePlain(projectId).pipe(Effect.option))._tag === "Some";
          yield* logMachineOutcome(projectId, {
            outcome: plainPossible ? "plain_offered" : "plain_unavailable",
            reason: failure.reason,
          });
          return yield* plainPossible
            ? new CloudSessionFailedError({
                reason: failure.reason,
                message: failure.message + OFFER,
                plainAvailable: true,
                ...(failure.retryAt === undefined ? {} : { retryAt: failure.retryAt }),
                ...(failure.host === undefined ? {} : { host: failure.host }),
              })
            : failure;
        }),
      ),
    );
