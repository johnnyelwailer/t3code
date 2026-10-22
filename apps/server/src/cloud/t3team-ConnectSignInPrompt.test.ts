import { assert, describe, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";
import { ConnectCredentialMintError } from "./t3team-ConnectCredentialMintError.ts";
import * as ConnectSignInPrompt from "./t3team-ConnectSignInPrompt.ts";

const LINKED_USER_ID = "cloud-linked-user-id";
const TOKEN: CliTokenManager.PersistedToken = {
  accessToken: "at",
  refreshToken: "rt",
  expiresAtEpochMs: Number.MAX_SAFE_INTEGER,
};

interface Harness {
  readonly linked: boolean;
  /** Settles each mint the prompt starts; `mints` counts them. */
  readonly mintResult: Deferred.Deferred<void, ConnectCredentialMintError>;
  readonly credential: Ref.Ref<Option.Option<CliTokenManager.PersistedToken>>;
  readonly mints: Ref.Ref<number>;
}

const makeHarness = (linked = true) =>
  Effect.gen(function* () {
    return {
      linked,
      mintResult: yield* Deferred.make<void, ConnectCredentialMintError>(),
      credential: yield* Ref.make(Option.none<CliTokenManager.PersistedToken>()),
      mints: yield* Ref.make(0),
    } satisfies Harness;
  });

const promptLayer = (h: Harness) =>
  ConnectSignInPrompt.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(ServerSecretStore.ServerSecretStore)({
          get: (name: string) =>
            Effect.succeed(
              name === LINKED_USER_ID && h.linked
                ? Option.some(new TextEncoder().encode("user-1"))
                : Option.none(),
            ),
        } as never),
        Layer.mock(CliTokenManager.CloudCliTokenManager)({
          getExisting: Ref.get(h.credential),
        } as never),
        Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
          mint: () =>
            Ref.update(h.mints, (n) => n + 1).pipe(
              Effect.andThen(Deferred.await(h.mintResult)),
              Effect.tap(() => Ref.set(h.credential, Option.some(TOKEN))),
            ),
        }),
      ),
    ),
  );

const withPrompt = <A, E>(
  h: Harness,
  body: (prompt: ConnectSignInPrompt.ConnectSignInPrompt["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    return yield* body(yield* ConnectSignInPrompt.ConnectSignInPrompt);
  }).pipe(Effect.provide(promptLayer(h)));

const settle = Effect.yieldNow.pipe(Effect.repeat({ times: 5 }));

describe("ConnectSignInPrompt", () => {
  it.effect("reports nothing for an install that is not linked", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness(false);
      const status = yield* withPrompt(h, (p) => p.status);
      assert.deepEqual(status, { required: false, attempt: "idle" });
    }),
  );

  it.effect("reports a missing credential without starting any sign-in", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const status = yield* withPrompt(h, (p) => p.status.pipe(Effect.tap(() => p.status)));
      assert.deepEqual(status, { required: true, attempt: "idle" });
      assert.strictEqual(yield* Ref.get(h.mints), 0);
    }),
  );

  it.effect("starts the browser sign-in only when the user asks, and it completes", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const [started, after] = yield* withPrompt(h, (p) =>
        Effect.gen(function* () {
          const started = yield* p.start;
          // A second click while the sign-in is open joins it instead of opening another.
          yield* p.start;
          yield* Deferred.succeed(h.mintResult, undefined);
          yield* settle;
          return [started, yield* p.status] as const;
        }),
      );
      assert.deepEqual(started, { required: true, attempt: "in_progress" });
      assert.strictEqual(yield* Ref.get(h.mints), 1);
      assert.deepEqual(after, { required: false, attempt: "idle" });
    }),
  );

  it.effect("remembers a failed attempt and never retries it on its own", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      const statuses = yield* withPrompt(h, (p) =>
        Effect.gen(function* () {
          yield* p.start;
          yield* Deferred.fail(
            h.mintResult,
            new ConnectCredentialMintError({ reason: "browser_callback_timeout" }),
          );
          yield* settle;
          // Status polls after the failure must not open another sign-in.
          return [yield* p.status, yield* p.status, yield* p.status];
        }),
      );
      for (const status of statuses) {
        assert.deepEqual(status, { required: true, attempt: "failed" });
      }
      assert.strictEqual(yield* Ref.get(h.mints), 1);
    }),
  );

  it.effect("does not start a sign-in when the credential is already present", () =>
    Effect.gen(function* () {
      const h = yield* makeHarness();
      yield* Ref.set(h.credential, Option.some(TOKEN));
      const status = yield* withPrompt(h, (p) => p.start);
      assert.deepEqual(status, { required: false, attempt: "idle" });
      assert.strictEqual(yield* Ref.get(h.mints), 0);
    }),
  );
});
