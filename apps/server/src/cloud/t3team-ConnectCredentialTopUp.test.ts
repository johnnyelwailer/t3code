import { assert, describe, it } from "@effect/vitest";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ExternalLauncher from "../process/externalLauncher.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import {
  runConnectCredentialTopUp,
  topUpConnectCredentialOnce,
} from "./t3team-ConnectCredentialTopUp.ts";

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

const cliLayer = (existing: Option.Option<CliTokenManager.PersistedToken>, reads: Array<1>) =>
  Layer.mock(CliTokenManager.CloudCliTokenManager)({
    getExisting: Effect.sync(() => reads.push(1)).pipe(Effect.as(existing)),
  } as never);

const run = (
  linkedUserId: string | null,
  existing: Option.Option<CliTokenManager.PersistedToken>,
) =>
  topUpConnectCredentialOnce().pipe(
    Effect.provide(Layer.mergeAll(secretsLayer(linkedUserId), cliLayer(existing, []))),
  );

describe("topUpConnectCredentialOnce", () => {
  it.effect("does nothing for an install that is not linked", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* run(null, Option.none()), "not_linked");
    }),
  );

  it.effect("keeps a present credential fresh without any browser", () =>
    Effect.gen(function* () {
      const nowEpochMs = yield* Clock.currentTimeMillis;
      const outcome = yield* run(
        "user-1",
        Option.some({ accessToken: "at", refreshToken: "rt", expiresAtEpochMs: nowEpochMs + 1 }),
      );
      assert.strictEqual(outcome, "fresh");
    }),
  );

  it.effect("only reports a missing credential; it never starts a sign-in", () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* run("user-1", Option.none()), "sign_in_required");
    }),
  );
});

describe("runConnectCredentialTopUp", () => {
  it.effect("never opens a browser on start or on later passes while signed out", () =>
    Effect.gen(function* () {
      const launches: Array<string> = [];
      const reads: Array<1> = [];
      const launcher = Layer.mock(ExternalLauncher.ExternalLauncher)({
        launchBrowser: (url: string) => Effect.sync(() => launches.push(url)).pipe(Effect.asVoid),
      } as never);
      const fiber = yield* Effect.forkChild(
        runConnectCredentialTopUp().pipe(
          Effect.provide(
            Layer.mergeAll(secretsLayer("user-1"), cliLayer(Option.none(), reads), launcher),
          ),
        ),
        { startImmediately: true },
      );
      // Initial delay plus three intervals: the loop keeps checking quietly.
      yield* TestClock.adjust("20 seconds");
      yield* TestClock.adjust("15 minutes");
      yield* Fiber.interrupt(fiber);
      assert.isAtLeast(reads.length, 2);
      assert.lengthOf(launches, 0);
    }),
  );
});
