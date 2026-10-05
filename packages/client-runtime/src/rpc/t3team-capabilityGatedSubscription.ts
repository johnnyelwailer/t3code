import type { T3TeamEnvironmentCapabilities } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import {
  subscribeDynamic,
  type EnvironmentRpcInput,
  type EnvironmentRpcStreamFailure,
  type EnvironmentRpcStreamValue,
  type EnvironmentSubscriptionRpcTag,
} from "./client.ts";
import type { RpcSession } from "./session.ts";

/** Reads one flag of the server's fork capability block; a missing block means "unsupported". */
export type T3TeamCapabilityCheck = (
  capabilities: T3TeamEnvironmentCapabilities | undefined,
) => boolean;

const sessionSupports = (session: RpcSession, supported: T3TeamCapabilityCheck) =>
  session.initialConfig.pipe(
    Effect.map((config) => supported(config.environment.capabilities.t3team)),
    Effect.orElseSucceed(() => false),
  );

/**
 * Subscribes to a fork RPC stream only while the connected server advertises
 * it in the environment descriptor's `t3team` capability block, and emits
 * `unsupported` (an empty snapshot) while it does not. Upstream servers omit
 * the block and reject an unknown RPC tag, so fork clients must never send it
 * under version skew.
 *
 * The outer stream follows the advertised support across sessions and only
 * switches when it flips; the inner subscription re-checks it per session
 * before opening, so a session swap to an older server never sends the tag
 * even while the outer switch is still catching up.
 */
export function subscribeWhenSupported<TTag extends EnvironmentSubscriptionRpcTag>(
  tag: TTag,
  input: EnvironmentRpcInput<TTag>,
  options: {
    readonly supported: T3TeamCapabilityCheck;
    readonly unsupported: EnvironmentRpcStreamValue<TTag>;
  },
): Stream.Stream<
  EnvironmentRpcStreamValue<TTag>,
  EnvironmentRpcStreamFailure<TTag>,
  EnvironmentSupervisor.EnvironmentSupervisor
> {
  const gatedInput = (session: RpcSession) =>
    sessionSupports(session, options.supported).pipe(
      Effect.flatMap((supported) => (supported ? Effect.succeed(input) : Effect.never)),
    );
  return Stream.unwrap(
    EnvironmentSupervisor.EnvironmentSupervisor.pipe(
      Effect.map((supervisor) =>
        SubscriptionRef.changes(supervisor.session).pipe(
          Stream.switchMap(
            Option.match({
              onNone: () => Stream.empty,
              onSome: (session) => Stream.fromEffect(sessionSupports(session, options.supported)),
            }),
          ),
          Stream.changes,
          Stream.switchMap((supported) =>
            supported ? subscribeDynamic(tag, gatedInput) : Stream.make(options.unsupported),
          ),
        ),
      ),
    ),
  );
}
