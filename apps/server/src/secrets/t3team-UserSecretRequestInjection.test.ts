import { assert, it } from "@effect/vitest";
import type { UserSecretGrant } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

import { checkGrantUse } from "./t3team-userSecretGrants.ts";
import {
  UserSecretRequestInjection,
  UserSecretRequestInjectionLive,
} from "./t3team-UserSecretRequestInjection.ts";
import { UserSecretRefused, UserSecretResolver } from "./t3team-UserSecretResolver.ts";

const grants = new Map<string, UserSecretGrant>([
  [
    "GITHUB_API",
    {
      name: "GITHUB_API",
      kind: "secret",
      deliveryModes: ["requestInjection"],
      destinations: ["api.example.com", "*.uploads.example.com"],
      approval: "perThread",
    },
  ],
  [
    "SEARCH_KEY",
    {
      name: "SEARCH_KEY",
      kind: "secret",
      deliveryModes: ["requestInjection"],
      destinations: ["search.example.com"],
      approval: "never",
      requestHeader: { name: "X-Api-Key", template: "{value}" },
    },
  ],
  [
    "CODEX_LOGIN",
    {
      name: "CODEX_LOGIN",
      kind: "authSlot",
      deliveryModes: ["requestInjection"],
      destinations: ["api.example.com"],
      approval: "never",
    },
  ],
]);

const Resolver = Layer.succeed(
  UserSecretResolver,
  UserSecretResolver.of({
    grant: (name) => grants.get(name),
    resolve: (input) => {
      const refusal = checkGrantUse(
        input.name,
        grants.get(input.name),
        input.mode,
        input.destination,
        0,
      );
      return refusal === undefined
        ? Effect.succeed(Redacted.make(`dummy-${input.name.toLowerCase()}`))
        : Effect.fail(new UserSecretRefused({ name: input.name, reason: refusal }));
    },
  }),
);

const headersFor = (names: ReadonlyArray<string>, host: string) =>
  Effect.flatMap(UserSecretRequestInjection, (injection) => injection.headersFor({ names, host }));

it.layer(UserSecretRequestInjectionLive.pipe(Layer.provide(Resolver)))(
  "request injection",
  (it) => {
    it.effect("adds the rendered header only for an allowed host", () =>
      Effect.gen(function* () {
        const [bearer] = yield* headersFor(["GITHUB_API"], "API.example.com:443");
        assert.strictEqual(bearer?.name, "Authorization");
        assert.strictEqual(Redacted.value(bearer!.value), "Bearer dummy-github_api");
        const [custom] = yield* headersFor(["SEARCH_KEY"], "search.example.com");
        assert.deepStrictEqual(
          [custom?.name, Redacted.value(custom!.value)],
          ["X-Api-Key", "dummy-search_key"],
        );
        assert.lengthOf(yield* headersFor(["GITHUB_API"], "eu.uploads.example.com"), 1);
      }),
    );

    it.effect("adds nothing for any other host", () =>
      Effect.gen(function* () {
        for (const host of [
          "attacker.net",
          "uploads.example.com",
          "api.example.com.attacker.net",
        ]) {
          const refused = yield* Effect.flip(headersFor(["GITHUB_API"], host));
          assert.strictEqual(refused.reason, "destination_not_allowed");
        }
      }),
    );

    it.effect("refuses a login slot and an ungranted name", () =>
      Effect.gen(function* () {
        assert.strictEqual(
          (yield* Effect.flip(headersFor(["CODEX_LOGIN"], "api.example.com"))).reason,
          "login_slot",
        );
        assert.strictEqual(
          (yield* Effect.flip(headersFor(["OTHER"], "api.example.com"))).reason,
          "not_granted",
        );
      }),
    );
  },
);
