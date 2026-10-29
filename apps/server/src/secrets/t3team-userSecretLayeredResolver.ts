/**
 * The resolver a session runs with: its own grants first, then those the user approved mid-session.
 * The session's own grants win outright (`RequestedUserSecrets` refuses a shadowing name), so a
 * request can only add to what the session may use, never change a policy it was started with.
 */
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  makeDirectoryResolver,
  userSecretsDirectory,
} from "./t3team-userSecretDirectoryResolver.ts";
import { checkGrantUse } from "./t3team-userSecretGrants.ts";
import { makeRequestedUserSecrets, RequestedUserSecrets } from "./t3team-RequestedUserSecrets.ts";
import { UserSecretRefused, UserSecretResolver } from "./t3team-UserSecretResolver.ts";

export function makeLayeredResolver(
  base: UserSecretResolver["Service"],
  requested: RequestedUserSecrets["Service"],
): UserSecretResolver["Service"] {
  return UserSecretResolver.of({
    grant: (name) => base.grant(name) ?? requested.lookup(name)?.grant,
    resolve: Effect.fn("UserSecretResolver.resolveLayered")(function* (input) {
      if (base.grant(input.name) !== undefined) return yield* base.resolve(input);
      const entry = requested.lookup(input.name);
      const refusal = checkGrantUse(
        input.name,
        entry?.grant,
        input.mode,
        input.destination,
        yield* Clock.currentTimeMillis,
      );
      if (refusal !== undefined || entry === undefined) {
        return yield* new UserSecretRefused({ name: input.name, reason: refusal ?? "not_granted" });
      }
      return entry.value;
    }),
  });
}

/**
 * Builds the session's resolver and the store of mid-session grants together, so the request tool and
 * the injection tool share one instance.
 */
export const UserSecretResolverLive = Layer.unwrap(
  Effect.gen(function* () {
    const base = yield* makeDirectoryResolver(yield* userSecretsDirectory);
    const requested = makeRequestedUserSecrets({
      reserved: (name) => base.grant(name) !== undefined,
    });
    return Layer.mergeAll(
      Layer.succeed(UserSecretResolver, makeLayeredResolver(base, requested)),
      Layer.succeed(RequestedUserSecrets, requested),
    );
  }).pipe(Effect.orDie),
);
