import { AccountError } from "@t3tools/contracts";
import type { AccountOAuthClient } from "@t3tools/shared/t3team-accountOAuth";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import type { MobileAccountDefinition } from "./t3team-accountIssuer";
import type { AccountTokenStore } from "./t3team-accountTokenStore";

/**
 * A token for one of the account's resources: the cached one while it is fresh, else the stored
 * grant redeemed for that resource's scope. A grant the issuer rejects signs the user out (the UI
 * then offers "Sign in" again); an unreachable issuer keeps the grant for the next try.
 */
export const makeAccessTokens = (input: {
  readonly account: MobileAccountDefinition;
  readonly oauth: AccountOAuthClient;
  readonly tokens: AccountTokenStore;
  readonly generation: Ref.Ref<number>;
  readonly signOut: Effect.Effect<void>;
  readonly publish: Effect.Effect<void>;
}) => {
  const { account, oauth, tokens } = input;
  const refreshLock = Semaphore.makeUnsafe(1);
  const signInRequired = (message = `Sign in to ${account.label} to continue.`) =>
    new AccountError({ reason: "sign_in_required", message });

  return (resource: string): Effect.Effect<string, AccountError> =>
    Effect.gen(function* () {
      if (!Object.hasOwn(account.resources, resource)) {
        return yield* new AccountError({
          reason: "unavailable",
          message: `${account.label} has no resource named ${resource}.`,
        });
      }
      const hit = yield* tokens.fresh(resource);
      if (Option.isSome(hit)) return hit.value;
      // One refresh at a time: two concurrent refreshes with one rotating grant would make the loser
      // look "rejected" and sign the user out right after the winner stored the new grant.
      return yield* refreshLock.withPermits(1)(
        Effect.gen(function* () {
          const raced = yield* tokens.fresh(resource);
          if (Option.isSome(raced)) return raced.value;
          const refresh = yield* tokens.grant;
          if (Option.isNone(refresh)) return yield* signInRequired();
          const before = yield* Ref.get(input.generation);
          const granted = yield* oauth.refresh(refresh.value, resource).pipe(
            Effect.catch((failure) =>
              failure === "unreachable"
                ? Effect.fail(
                    new AccountError({
                      reason: "unavailable",
                      message: `Could not reach the ${account.label} sign-in.`,
                    }),
                  )
                : input.signOut.pipe(
                    Effect.andThen(
                      Effect.fail(
                        signInRequired(`Your ${account.label} sign-in expired. Sign in again.`),
                      ),
                    ),
                  ),
            ),
          );
          if ((yield* Ref.get(input.generation)) !== before) return yield* signInRequired();
          const token = yield* tokens.store(resource, granted);
          yield* input.publish;
          return token;
        }),
      );
    });
};
