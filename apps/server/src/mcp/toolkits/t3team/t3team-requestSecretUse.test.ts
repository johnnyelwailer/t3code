import { assert, describe, it } from "@effect/vitest";
import { ProjectId, SecretRef, UserSecretRequestUse } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { afterEach } from "vite-plus/test";

import type * as SecretRequests from "../../../secrets/SecretRequests.ts";
import {
  makeRequestedUserSecrets,
  RequestedUserSecrets,
} from "../../../secrets/t3team-RequestedUserSecrets.ts";
import { makeLayeredResolver } from "../../../secrets/t3team-userSecretLayeredResolver.ts";
import { UserSecretResolver } from "../../../secrets/t3team-UserSecretResolver.ts";
import { grantRequestedUse, requestUseTarget } from "./t3team-requestSecretUse.ts";

const use = Schema.decodeUnknownSync(UserSecretRequestUse)({
  name: "NX_GH_PKG_READ_TOKEN",
  host: "npm.pkg.github.com",
  scopes: ["read:packages"],
});
const REF = SecretRef.make("secret-ref:00000000000000000000000000000001");
const PROJECT = ProjectId.make("project-1");

/** A saved answer waiting under its one-use ref, as SecretRequests keeps it. */
const secretRequests = (value: string) => {
  const consumed: string[] = [];
  const service = {
    consume: ({ ref }: { ref: string }) =>
      consumed.includes(ref)
        ? Effect.fail({ message: "That secretRef was already used or does not exist." })
        : Effect.sync(() => (consumed.push(ref), value)),
  } as unknown as SecretRequests.SecretRequests["Service"];
  return service;
};

describe("request_secret with a use block", () => {
  afterEach(() => replaceFeatureFlagPresetValues(new Map()));

  it.effect("is refused while user-secret injection is off, before the user is asked", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["AGENTS_USER_SECRET_INJECTION", false]]));
      const store = makeRequestedUserSecrets({ reserved: () => false });
      const message = yield* requestUseTarget(use).pipe(
        Effect.provide(Layer.succeed(RequestedUserSecrets, store)),
        Effect.flip,
      );
      assert.include(message, "turned off");
    }),
  );

  it.effect("is refused when the host has no injection store", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["AGENTS_USER_SECRET_INJECTION", true]]));
      const message = yield* requestUseTarget(use).pipe(Effect.flip);
      assert.include(message, "turned off");
    }),
  );

  it.effect("is refused up front for a name the session was granted", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["AGENTS_USER_SECRET_INJECTION", true]]));
      const store = makeRequestedUserSecrets({ reserved: (name) => name === use.name });
      const message = yield* requestUseTarget(use).pipe(
        Effect.provide(Layer.succeed(RequestedUserSecrets, store)),
        Effect.flip,
      );
      assert.include(message, "granted when this session started");
    }),
  );

  it.effect("turns the approved value into a grant the injection tool can use, once", () =>
    Effect.gen(function* () {
      replaceFeatureFlagPresetValues(new Map([["AGENTS_USER_SECRET_INJECTION", true]]));
      const store = makeRequestedUserSecrets({ reserved: () => false });
      const target = yield* requestUseTarget(use).pipe(
        Effect.provide(Layer.succeed(RequestedUserSecrets, store)),
      );
      const requests = secretRequests("canary-approved-value");
      const name = yield* grantRequestedUse({
        store: target,
        secretRequests: requests,
        use,
        ref: REF,
        projectId: PROJECT,
      });
      assert.strictEqual(name, "NX_GH_PKG_READ_TOKEN");

      const resolver = makeLayeredResolver(
        UserSecretResolver.of({
          grant: () => undefined,
          resolve: () => Effect.die("not granted at start"),
        }),
        store,
      );
      const value = yield* resolver.resolve({
        name,
        mode: "processInjection",
        destination: "npm.pkg.github.com",
      });
      assert.strictEqual(Redacted.value(value), "canary-approved-value");
      assert.deepStrictEqual(resolver.grant(name)?.destinations, ["npm.pkg.github.com"]);

      const second = yield* grantRequestedUse({
        store: target,
        secretRequests: requests,
        use,
        ref: REF,
        projectId: PROJECT,
      }).pipe(Effect.flip);
      assert.include(second, "already used", "the ref is one-use: a replay grants nothing");
    }),
  );

  it.effect("revoking the grant ends the use at once", () =>
    Effect.gen(function* () {
      const store = makeRequestedUserSecrets({ reserved: () => false });
      yield* grantRequestedUse({
        store,
        secretRequests: secretRequests("canary-approved-value"),
        use,
        ref: REF,
        projectId: PROJECT,
      });
      const resolver = makeLayeredResolver(
        UserSecretResolver.of({
          grant: () => undefined,
          resolve: () => Effect.die("not granted at start"),
        }),
        store,
      );
      assert.isTrue(yield* store.revoke(use.name));
      const reason = yield* resolver.resolve({ name: use.name, mode: "processInjection" }).pipe(
        Effect.flip,
        Effect.map((error) => error.reason),
      );
      assert.strictEqual(reason, "not_granted");
    }),
  );
});
