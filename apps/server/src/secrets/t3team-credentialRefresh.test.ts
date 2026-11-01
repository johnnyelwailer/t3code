import { assert, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { makeCredentialRefresh, type GhProcess } from "./t3team-CredentialRefresh.ts";

const CANARY = "ghp_canaryTokenValue0123456789abcdef";
const OUTPUT = [
  `! One-time code (ABCD-1234) copied to clipboard ${CANARY}`,
  "Open this URL to continue in your web browser: https://github.com/login/device",
];

const setup = (
  options: { readonly lines?: Stream.Stream<string>; readonly env?: Record<string, string> } = {},
) =>
  Effect.gen(function* () {
    const calls: Array<ReadonlyArray<string>> = [];
    const exit = yield* Deferred.make<number>();
    let kills = 0;
    const refresh = makeCredentialRefresh({
      environment: options.env ?? {},
      spawnGh: (args) => {
        calls.push(args);
        return Effect.succeed({
          lines: options.lines ?? Stream.concat(Stream.fromIterable(OUTPUT), Stream.never),
          exited: Deferred.await(exit),
          kill: Effect.sync(() => void (kills += 1)),
        } satisfies GhProcess);
      },
    });
    return { refresh, calls, exit, kills: () => kills };
  });

const errorReason = <A, E>(effect: Effect.Effect<A, E>) =>
  Effect.exit(effect).pipe(
    Effect.map((exit) => (Exit.isFailure(exit) ? JSON.stringify(exit.cause) : "succeeded")),
  );

it.effect("starts gh with a fixed argv and returns only the parsed code and page", () =>
  Effect.gen(function* () {
    const { refresh, calls } = yield* setup();
    const result = yield* refresh.start({ host: "npm.pkg.github.com", scopes: ["read:packages"] });
    assert.deepStrictEqual(calls, [["auth", "refresh", "-h", "github.com", "-s", "read:packages"]]);
    assert.strictEqual(result.userCode, "ABCD-1234");
    assert.strictEqual(result.verificationUri, "https://github.com/login/device");
    assert.match(result.id, /^[0-9a-f]{32}$/);
    assert.notInclude(JSON.stringify(result), CANARY);
    assert.notInclude(result.id, "github");
  }),
);

it.effect("joins several scopes into one -s value", () =>
  Effect.gen(function* () {
    const { refresh, calls } = yield* setup();
    yield* refresh.start({
      host: "github.com",
      scopes: ["write:packages", "read:packages", "read:packages"],
    });
    assert.deepStrictEqual(calls[0]?.slice(-2), ["-s", "read:packages,write:packages"]);
  }),
);

it.effect("refuses a host that is not a forge host without spawning", () =>
  Effect.gen(function* () {
    const { refresh, calls } = yield* setup();
    const failure = yield* errorReason(
      refresh.start({ host: "evil.example.com", scopes: ["read:packages"] }),
    );
    assert.include(failure, "not_available");
    assert.strictEqual(calls.length, 0);
  }),
);

it.effect("allows the host gh is configured for through GH_HOST", () =>
  Effect.gen(function* () {
    const { refresh, calls } = yield* setup({
      env: { GH_HOST: "git.corp.example" },
      lines: Stream.concat(
        Stream.fromIterable([
          "! One-time code (ABCD-1234) copied to clipboard",
          "Open this URL to continue in your web browser: https://git.corp.example/login/device",
        ]),
        Stream.never,
      ),
    });
    yield* refresh.start({ host: "git.corp.example", scopes: ["read:packages"] });
    assert.strictEqual(calls[0]?.[3], "git.corp.example");
  }),
);

it.effect("only package scopes are ever passed to gh", () =>
  Effect.gen(function* () {
    const { refresh, calls } = yield* setup();
    for (const scopes of [
      ["admin:org"],
      ["delete_repo"],
      ["repo"],
      [],
      ["read:packages", "admin:org"],
      ["--hostname"],
      ["read:packages,repo"],
      ["READ:PACKAGES"],
    ]) {
      assert.include(
        yield* errorReason(refresh.start({ host: "github.com", scopes })),
        "scope_not_allowed",
      );
    }
    assert.strictEqual(calls.length, 0);
  }),
);

it.effect("a different scope set starts its own flow instead of reusing the pending one", () =>
  Effect.gen(function* () {
    const { refresh, calls } = yield* setup();
    const read = yield* refresh.start({ host: "github.com", scopes: ["read:packages"] });
    const write = yield* refresh.start({ host: "github.com", scopes: ["write:packages"] });
    assert.notStrictEqual(read.id, write.id);
    assert.strictEqual(calls.length, 2);
  }),
);

it.effect("only the flow host's own device page is shown, never another https line", () =>
  Effect.gen(function* () {
    const other = yield* setup({
      lines: Stream.fromIterable([
        "code (ABCD-1234)",
        "Open https://evil.example/login/device",
        "or https://github.com.evil.example/login/device",
        "or https://github.com/login/device/../../x",
      ]),
    });
    assert.include(
      yield* errorReason(other.refresh.start({ host: "github.com", scopes: ["read:packages"] })),
      "start_failed",
    );
    const own = yield* setup({
      env: { GH_HOST: "ghe.example.com" },
      lines: Stream.concat(
        Stream.fromIterable([
          "Visit https://evil.example/login/device",
          "code (ABCD-1234)",
          "Open https://ghe.example.com/login/device.",
        ]),
        Stream.never,
      ),
    });
    const result = yield* own.refresh.start({
      host: "ghe.example.com",
      scopes: ["read:packages"],
    });
    assert.strictEqual(result.verificationUri, "https://ghe.example.com/login/device");
  }),
);

it.effect("a second start for the same host reuses the pending flow", () =>
  Effect.gen(function* () {
    const { refresh, calls } = yield* setup();
    const first = yield* refresh.start({ host: "github.com", scopes: ["read:packages"] });
    const second = yield* refresh.start({ host: "ghcr.io", scopes: ["read:packages"] });
    assert.deepStrictEqual(second, first);
    assert.strictEqual(calls.length, 1);
  }),
);

it.effect("after the flow finishes a new start spawns again, with a new id", () =>
  Effect.gen(function* () {
    const { refresh, calls, exit } = yield* setup();
    const first = yield* refresh.start({ host: "github.com", scopes: ["read:packages"] });
    yield* Deferred.succeed(exit, 0);
    yield* Effect.yieldNow;
    assert.deepStrictEqual(yield* refresh.status({ id: first.id }), { state: "done" });
    const second = yield* refresh.start({ host: "github.com", scopes: ["read:packages"] });
    assert.strictEqual(calls.length, 2);
    assert.notStrictEqual(second.id, first.id);
  }),
);

it.effect("reports pending, then failed when gh exits non-zero", () =>
  Effect.gen(function* () {
    const { refresh, exit } = yield* setup();
    const { id } = yield* refresh.start({ host: "github.com", scopes: ["read:packages"] });
    assert.deepStrictEqual(yield* refresh.status({ id }), { state: "pending" });
    yield* Deferred.succeed(exit, 1);
    yield* Effect.yieldNow;
    assert.deepStrictEqual(yield* refresh.status({ id }), { state: "failed" });
  }),
);

it.effect("no code line within the wait kills gh and fails the start", () =>
  Effect.gen(function* () {
    const { refresh, kills } = yield* setup({ lines: Stream.never });
    const fiber = yield* Effect.forkChild(
      errorReason(refresh.start({ host: "github.com", scopes: ["read:packages"] })),
    );
    yield* TestClock.adjust("16 seconds");
    const failure = yield* Fiber.join(fiber);
    assert.include(failure, "start_failed");
    assert.strictEqual(kills(), 1);
  }),
);

it.effect("output that ends without a code fails at once and never echoes the output", () =>
  Effect.gen(function* () {
    const { refresh, kills } = yield* setup({
      lines: Stream.fromIterable([`error: not signed in ${CANARY}`]),
    });
    const failure = yield* errorReason(
      refresh.start({ host: "github.com", scopes: ["read:packages"] }),
    );
    assert.include(failure, "start_failed");
    assert.notInclude(failure, CANARY);
    assert.strictEqual(kills(), 1);
  }),
);

it.effect("a page that is not https is never accepted", () =>
  Effect.gen(function* () {
    const { refresh } = yield* setup({
      lines: Stream.fromIterable(["code (ABCD-1234)", "Open http://evil.example/login/device"]),
    });
    assert.include(
      yield* errorReason(refresh.start({ host: "github.com", scopes: ["read:packages"] })),
      "start_failed",
    );
  }),
);

it.effect("an unknown id is unknown, and a flow is forgotten and killed after its lifetime", () =>
  Effect.gen(function* () {
    const { refresh, kills } = yield* setup();
    assert.include(yield* errorReason(refresh.status({ id: "0".repeat(32) })), "unknown_id");
    const { id } = yield* refresh.start({ host: "github.com", scopes: ["read:packages"] });
    yield* TestClock.adjust("16 minutes");
    assert.include(yield* errorReason(refresh.status({ id })), "unknown_id");
    assert.strictEqual(kills(), 1);
  }),
);
