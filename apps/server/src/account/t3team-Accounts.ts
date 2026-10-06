import type { AccountStatus } from "@t3tools/contracts";
import type { AccountDefinition } from "@t3team/pack-api";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";
import { AccountError } from "./t3team-AccountError.ts";
import { type AccountSession, makeAccountSession } from "./t3team-AccountSession.ts";
import { packAccounts } from "./t3team-packAccounts.ts";

/**
 * The accounts the distribution defined (`defineAccount`), each with its own sign-in. Features ask
 * for a token by account and resource (`accessToken("acme", "broker")`) and never run a sign-in of
 * their own; the user signs in once per account, from the app's account entry.
 */
export class Accounts extends Context.Service<
  Accounts,
  {
    readonly list: Effect.Effect<ReadonlyArray<AccountStatus>>;
    readonly signIn: (accountId: string) => Effect.Effect<AccountStatus, AccountError>;
    readonly signOut: (accountId: string) => Effect.Effect<void, AccountError>;
    /** A live access token for one of the account's resources, refreshed as needed. */
    readonly accessToken: (
      accountId: string,
      resource: string,
    ) => Effect.Effect<string, AccountError>;
  }
>()("t3/account/t3team-Accounts/Accounts") {}

const make = Effect.fn("account.accounts.make")(function* (
  definitions?: ReadonlyArray<AccountDefinition>,
) {
  const deps = {
    secrets: yield* ServerSecretStore.ServerSecretStore,
    http: yield* HttpClient.HttpClient,
    launcher: yield* ExternalLauncher.ExternalLauncher,
    crypto: yield* Crypto.Crypto,
  };
  const sessions = new Map<string, AccountSession>();
  // Read when the layer builds, not when this module loads: the distribution activates first.
  for (const definition of definitions ?? packAccounts()) {
    sessions.set(definition.id, yield* makeAccountSession(definition, deps));
  }

  const session = (accountId: string): Effect.Effect<AccountSession, AccountError> => {
    const found = sessions.get(accountId);
    return found === undefined
      ? Effect.fail(
          new AccountError({
            reason: "unavailable",
            message: `This build has no account named ${accountId}.`,
          }),
        )
      : Effect.succeed(found);
  };

  return Accounts.of({
    list: Effect.forEach([...sessions.values()], (s) => s.status),
    signIn: (accountId) => session(accountId).pipe(Effect.flatMap((s) => s.signIn)),
    signOut: (accountId) => session(accountId).pipe(Effect.flatMap((s) => s.signOut)),
    accessToken: (accountId, resource) =>
      session(accountId).pipe(Effect.flatMap((s) => s.accessToken(resource))),
  });
});

/** Accounts from the compiled-in distribution. */
export const layer = Layer.effect(Accounts, make());

/** Accounts from explicit definitions, for tests and hosts that do not use the pack overlay. */
export const layerFor = (definitions: ReadonlyArray<AccountDefinition>) =>
  Layer.effect(Accounts, make(definitions));
