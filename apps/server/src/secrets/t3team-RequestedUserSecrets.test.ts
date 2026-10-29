import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  grantFromRequestUse,
  UserSecretRequestUse,
  type UserSecretGrant,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as TestClock from "effect/testing/TestClock";

import { makeLayeredResolver } from "./t3team-userSecretLayeredResolver.ts";
import { makeRequestedUserSecrets } from "./t3team-RequestedUserSecrets.ts";
import { UserSecretResolver } from "./t3team-UserSecretResolver.ts";

const decodeUse = Schema.decodeUnknownSync(UserSecretRequestUse);
const use = (fields: Record<string, unknown>) =>
  decodeUse({ name: "NX_GH_PKG_READ_TOKEN", ...fields });

const directoryGrant: UserSecretGrant = {
  name: "API_TOKEN",
  kind: "secret",
  deliveryModes: ["processInjection"],
  destinations: [],
  approval: "never",
};

/** A base resolver that grants `directoryGrant` only, like a session started with one granted entry. */
const base = UserSecretResolver.of({
  grant: (name) => (name === directoryGrant.name ? directoryGrant : undefined),
  resolve: (input) =>
    input.name === directoryGrant.name
      ? Effect.succeed(Redacted.make("directory-value"))
      : Effect.die("the base resolver is only asked for what it grants"),
});

const refusal = <A, E extends { readonly reason: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => error.reason),
  );

const setup = Effect.sync(() => {
  const requested = makeRequestedUserSecrets({
    reserved: (name) => base.grant(name) !== undefined,
  });
  return { requested, resolver: makeLayeredResolver(base, requested) };
});

it.layer(NodeServices.layer)("requested user secrets", (it) => {
  it.effect("a secret requested mid-session becomes usable without a restart", () =>
    Effect.gen(function* () {
      const { requested, resolver } = yield* setup;
      assert.strictEqual(
        yield* refusal(
          resolver.resolve({ name: "NX_GH_PKG_READ_TOKEN", mode: "processInjection" }),
        ),
        "not_granted",
      );
      assert.isUndefined(resolver.grant("NX_GH_PKG_READ_TOKEN"));
      yield* requested.register(
        grantFromRequestUse(use({}), yield* Clock.currentTimeMillis),
        Redacted.make("canary-requested-value"),
      );
      const value = yield* resolver.resolve({
        name: "NX_GH_PKG_READ_TOKEN",
        mode: "processInjection",
      });
      assert.strictEqual(Redacted.value(value), "canary-requested-value");
      assert.strictEqual(String(value), "<redacted>");
      assert.strictEqual(resolver.grant("NX_GH_PKG_READ_TOKEN")?.approval, "perThread");
    }),
  );

  it.effect("what the session started with still resolves from its own resolver", () =>
    Effect.gen(function* () {
      const { resolver } = yield* setup;
      const value = yield* resolver.resolve({ name: "API_TOKEN", mode: "processInjection" });
      assert.strictEqual(Redacted.value(value), "directory-value");
    }),
  );

  it.effect("a request can neither replace nor shadow a name the session was granted", () =>
    Effect.gen(function* () {
      const { requested } = yield* setup;
      const reason = yield* refusal(
        requested.register(
          grantFromRequestUse(use({ name: "API_TOKEN" }), yield* Clock.currentTimeMillis),
          Redacted.make("attacker"),
        ),
      );
      assert.strictEqual(reason, "already_granted");
      assert.strictEqual(yield* refusal(requested.check("API_TOKEN")), "already_granted");
    }),
  );

  it.effect("a login slot name is never registered, even past the contract", () =>
    Effect.gen(function* () {
      const { requested } = yield* setup;
      const grant: UserSecretGrant = { ...directoryGrant, name: "AUTH_SLOT_CLAUDE" };
      assert.strictEqual(
        yield* refusal(requested.register(grant, Redacted.make("login-state"))),
        "login_slot",
      );
    }),
  );

  it.effect("revoking removes the grant at once, and the value with it", () =>
    Effect.gen(function* () {
      const { requested, resolver } = yield* setup;
      yield* requested.register(
        grantFromRequestUse(use({}), yield* Clock.currentTimeMillis),
        Redacted.make("canary-requested-value"),
      );
      assert.isTrue(yield* requested.revoke("NX_GH_PKG_READ_TOKEN"));
      assert.isFalse(yield* requested.revoke("NX_GH_PKG_READ_TOKEN"));
      assert.strictEqual(
        yield* refusal(
          resolver.resolve({ name: "NX_GH_PKG_READ_TOKEN", mode: "processInjection" }),
        ),
        "not_granted",
      );
      assert.deepStrictEqual(yield* requested.list, []);
    }),
  );

  it.effect("a grant expires when its time is up", () =>
    Effect.gen(function* () {
      const { requested, resolver } = yield* setup;
      yield* requested.register(
        grantFromRequestUse(use({ expiresInMinutes: 30 }), yield* Clock.currentTimeMillis),
        Redacted.make("canary-requested-value"),
      );
      yield* TestClock.adjust("29 minutes");
      yield* resolver.resolve({ name: "NX_GH_PKG_READ_TOKEN", mode: "processInjection" });
      yield* TestClock.adjust("2 minutes");
      assert.strictEqual(
        yield* refusal(
          resolver.resolve({ name: "NX_GH_PKG_READ_TOKEN", mode: "processInjection" }),
        ),
        "expired",
      );
    }),
  );

  it.effect("the grant's own limits apply: modes and destinations", () =>
    Effect.gen(function* () {
      const { requested, resolver } = yield* setup;
      yield* requested.register(
        grantFromRequestUse(
          use({ host: "npm.pkg.github.com", deliveryModes: ["requestInjection"] }),
          yield* Clock.currentTimeMillis,
        ),
        Redacted.make("canary-requested-value"),
      );
      assert.strictEqual(
        yield* refusal(
          resolver.resolve({ name: "NX_GH_PKG_READ_TOKEN", mode: "processInjection" }),
        ),
        "mode_not_allowed",
      );
      assert.strictEqual(
        yield* refusal(
          resolver.resolve({
            name: "NX_GH_PKG_READ_TOKEN",
            mode: "requestInjection",
            destination: "evil.example",
          }),
        ),
        "destination_not_allowed",
      );
      yield* resolver.resolve({
        name: "NX_GH_PKG_READ_TOKEN",
        mode: "requestInjection",
        destination: "npm.pkg.github.com",
      });
    }),
  );

  it.effect("the listing names what was granted and never carries a value", () =>
    Effect.gen(function* () {
      const { requested } = yield* setup;
      yield* requested.register(
        grantFromRequestUse(use({ host: "npm.pkg.github.com" }), yield* Clock.currentTimeMillis),
        Redacted.make("canary-requested-value"),
      );
      const listing = yield* requested.list;
      assert.strictEqual(listing.length, 1);
      assert.strictEqual(listing[0]?.name, "NX_GH_PKG_READ_TOKEN");
      assert.notInclude(JSON.stringify(listing), "canary-requested-value");
    }),
  );

  it.effect("approving the same name again replaces the value", () =>
    Effect.gen(function* () {
      const { requested, resolver } = yield* setup;
      const now = yield* Clock.currentTimeMillis;
      yield* requested.register(grantFromRequestUse(use({}), now), Redacted.make("first"));
      yield* requested.register(grantFromRequestUse(use({}), now), Redacted.make("rotated"));
      const value = yield* resolver.resolve({
        name: "NX_GH_PKG_READ_TOKEN",
        mode: "processInjection",
      });
      assert.strictEqual(Redacted.value(value), "rotated");
    }),
  );

  it.effect("a pending request is listed for its thread until it is answered", () =>
    Effect.gen(function* () {
      const { requested } = yield* setup;
      const mine = use({ host: "npm.pkg.github.com", scopes: ["read:packages"] });
      yield* requested.trackPending({ threadId: "thread-1", turnItemId: "item-1", use: mine });
      yield* requested.trackPending({
        threadId: "thread-2",
        turnItemId: "item-2",
        use: use({ name: "OTHER_KEY" }),
      });
      assert.deepStrictEqual(yield* requested.pendingFor("thread-1"), [
        { turnItemId: "item-1", use: mine },
      ]);
      yield* requested.untrack("item-1");
      assert.deepStrictEqual(yield* requested.pendingFor("thread-1"), []);
      assert.strictEqual((yield* requested.pendingFor("thread-2")).length, 1);
    }),
  );
});
