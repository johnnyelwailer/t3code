// @effect-diagnostics nodeBuiltinImport:off - the fixture plants a symlink, which Effect's FileSystem cannot create.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import type { UserSecretGrant } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Redacted from "effect/Redacted";

import {
  makeDirectoryResolver,
  USER_SECRET_GRANTS_FILE,
} from "./t3team-userSecretDirectoryResolver.ts";

const grants: ReadonlyArray<UserSecretGrant> = [
  {
    name: "API_TOKEN",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "never",
  },
  {
    name: "CLAUDE_LOGIN",
    kind: "authSlot",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "never",
  },
  {
    name: "AUTH_SLOT_CLAUDE",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "never",
  },
  {
    name: "LINKED",
    kind: "secret",
    deliveryModes: ["processInjection"],
    destinations: [],
    approval: "never",
  },
];

const fixture = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "user-secret-resolver-" });
  const directory = NodePath.join(root, "granted");
  NodeFS.mkdirSync(directory);
  NodeFS.writeFileSync(
    NodePath.join(directory, USER_SECRET_GRANTS_FILE),
    JSON.stringify({ version: 1, grants }),
  );
  NodeFS.writeFileSync(NodePath.join(directory, "API_TOKEN"), "dummy-api-token");
  NodeFS.writeFileSync(NodePath.join(directory, "UNLISTED"), "dummy-unlisted");
  NodeFS.writeFileSync(NodePath.join(directory, "CLAUDE_LOGIN"), "dummy-login-state");
  NodeFS.writeFileSync(NodePath.join(directory, "AUTH_SLOT_CLAUDE"), "dummy-leased-login-state");
  NodeFS.writeFileSync(NodePath.join(root, "outside"), "dummy-outside");
  NodeFS.symlinkSync(NodePath.join(root, "outside"), NodePath.join(directory, "LINKED"), "file");
  return directory;
});

const refusal = <A, E extends { readonly reason: string }, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.flip,
    Effect.map((error) => error.reason),
  );

it.layer(NodeServices.layer)("directory resolver", (it) => {
  it.effect("resolves a granted secret only through its allowed mode", () =>
    Effect.gen(function* () {
      const resolver = yield* makeDirectoryResolver(yield* fixture);
      const value = yield* resolver.resolve({ name: "API_TOKEN", mode: "processInjection" });
      assert.strictEqual(Redacted.value(value), "dummy-api-token");
      assert.strictEqual(String(value), "<redacted>");
      assert.strictEqual(
        yield* refusal(resolver.resolve({ name: "API_TOKEN", mode: "requestInjection" })),
        "mode_not_allowed",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("refuses a value on disk that the grant list does not name", () =>
    Effect.gen(function* () {
      const resolver = yield* makeDirectoryResolver(yield* fixture);
      assert.strictEqual(
        yield* refusal(resolver.resolve({ name: "UNLISTED", mode: "processInjection" })),
        "not_granted",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("never resolves a login slot, even when it is listed and present", () =>
    Effect.gen(function* () {
      const resolver = yield* makeDirectoryResolver(yield* fixture);
      assert.strictEqual(
        yield* refusal(resolver.resolve({ name: "CLAUDE_LOGIN", mode: "processInjection" })),
        "login_slot",
      );
      assert.strictEqual(
        yield* refusal(resolver.resolve({ name: "AUTH_SLOT_CLAUDE", mode: "processInjection" })),
        "login_slot",
        "a leased slot's file name is refused even when a grant mislabels it as a secret",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("refuses a granted name whose file is a link out of the directory", () =>
    Effect.gen(function* () {
      const resolver = yield* makeDirectoryResolver(yield* fixture);
      assert.strictEqual(
        yield* refusal(resolver.resolve({ name: "LINKED", mode: "processInjection" })),
        "unavailable",
      );
    }).pipe(Effect.scoped),
  );

  it.effect("grants nothing after start: a later grant list is ignored", () =>
    Effect.gen(function* () {
      const directory = yield* fixture;
      const resolver = yield* makeDirectoryResolver(directory);
      NodeFS.writeFileSync(
        NodePath.join(directory, USER_SECRET_GRANTS_FILE),
        JSON.stringify({ version: 1, grants: [{ ...grants[0], name: "UNLISTED" }] }),
      );
      assert.strictEqual(resolver.grant("UNLISTED"), undefined);
    }).pipe(Effect.scoped),
  );

  it.effect("grants nothing without a directory or with an unreadable grant list", () =>
    Effect.gen(function* () {
      const none = yield* makeDirectoryResolver(undefined);
      assert.strictEqual(none.grant("API_TOKEN"), undefined);
      const directory = yield* fixture;
      NodeFS.writeFileSync(NodePath.join(directory, USER_SECRET_GRANTS_FILE), "{not json");
      const broken = yield* makeDirectoryResolver(directory);
      assert.strictEqual(broken.grant("API_TOKEN"), undefined);
    }).pipe(Effect.scoped),
  );
});
