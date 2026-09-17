import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";
import { ConnectCredentialMintError } from "./t3team-ConnectCredentialMintError.ts";
import { topUpConnectCredentialOnce } from "./t3team-ConnectCredentialTopUp.ts";

const LINKED_USER_ID = "cloud-linked-user-id";

const secretsLayer = (linkedUserId: string | null) =>
  Layer.mock(ServerSecretStore.ServerSecretStore)({
    get: (name: string) =>
      Effect.succeed(
        name === LINKED_USER_ID && linkedUserId !== null
          ? Option.some(new TextEncoder().encode(linkedUserId))
          : Option.none(),
      ),
  } as never);

const cliLayer = (existing: Option.Option<CliTokenManager.PersistedToken>) =>
  Layer.mock(CliTokenManager.CloudCliTokenManager)({
    getExisting: Effect.succeed(existing),
  } as never);

const minterLayer = (calls: Array<unknown>) =>
  Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
    mint: (input) => Effect.sync(() => calls.push(input)).pipe(Effect.asVoid),
  });

const run = (
  linkedUserId: string | null,
  existing: Option.Option<CliTokenManager.PersistedToken>,
  calls: Array<unknown>,
) =>
  topUpConnectCredentialOnce().pipe(
    Effect.provide(
      Layer.mergeAll(secretsLayer(linkedUserId), cliLayer(existing), minterLayer(calls)),
    ),
  );

describe("topUpConnectCredentialOnce", () => {
  it.effect("never mints for an install that is not linked", () =>
    Effect.gen(function* () {
      const calls: Array<unknown> = [];
      yield* run(null, Option.none(), calls);
      assert.lengthOf(calls, 0);
    }),
  );

  it.effect("does nothing when a usable credential is already present", () =>
    Effect.gen(function* () {
      const calls: Array<unknown> = [];
      yield* run(
        "user-1",
        Option.some({
          accessToken: "at",
          refreshToken: "rt",
          expiresAtEpochMs: Date.now() + 3_600_000,
        }),
        calls,
      );
      assert.lengthOf(calls, 0);
    }),
  );

  it.effect("starts the in-app mint when linked but the credential is missing", () =>
    Effect.gen(function* () {
      const calls: Array<unknown> = [];
      yield* run("user-1", Option.none(), calls);
      // Exactly one mint; the top-up uses the mint's default wait, not the
      // short create-side one.
      assert.lengthOf(calls, 1);
      assert.deepEqual(calls[0], undefined);
    }),
  );

  it.effect("absorbs a failed mint so one bad cycle cannot stop the loop", () =>
    Effect.gen(function* () {
      const mintError = new ConnectCredentialMintError({
        reason: "browser_callback_timeout",
      });
      const layer = Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
        mint: () => Effect.fail(mintError),
      });
      yield* topUpConnectCredentialOnce().pipe(
        Effect.provide(Layer.mergeAll(secretsLayer("user-1"), cliLayer(Option.none()), layer)),
      );
      // Success: the failure was logged and swallowed by design.
    }),
  );
});
