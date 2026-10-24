import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { SourceControlProviderKind } from "@t3tools/contracts";
import { PullRequestProviderError } from "@t3tools/source-control-core/server/PullRequestProvider";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { makeRemoteMachineCache } from "./t3team-remoteMachineCache.ts";
import { remoteFixture, remoteCommit } from "./t3team-remoteMachine.fixtures.ts";

const url = "https://nexplore.ghe.com/acme/api.git";
const files = { ".devcontainer.json": '{"image":"node:24"}' };

it.layer(NodeServices.layer)("remote machine cache", (it) => {
  it.effect("shares a URL across workspaces and keeps immutable scans when HEAD TTL expires", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files });
      yield* Effect.gen(function* () {
        const scan = yield* makeRemoteMachineCache;
        const input = { url, cwd: fixture.root, repository: "." };
        const first = yield* scan(input);
        const reads = fixture.reads.length;
        const linked = yield* scan({
          ...input,
          cwd: `${fixture.root}/another-project`,
          repository: "acme/api",
        });
        expect(first?.candidates[0]?.repository).toBe(".");
        expect(linked?.candidates[0]?.repository).toBe("acme/api");
        expect(fixture.commands).toHaveLength(1);
        expect(fixture.reads).toHaveLength(reads);
        yield* TestClock.adjust("5 minutes");
        yield* scan(input);
        expect(fixture.commands).toHaveLength(2);
        expect(fixture.reads).toHaveLength(reads);
      }).pipe(Effect.provide(fixture.dependencies));
    }),
  );

  it.effect("rescans when the advertised commit changes", () =>
    Effect.gen(function* () {
      let commit = remoteCommit;
      const fixture = yield* remoteFixture({ files, gitOutput: () => `${commit}\tHEAD\n` });
      yield* Effect.gen(function* () {
        const scan = yield* makeRemoteMachineCache;
        const input = { url, cwd: fixture.root, repository: "." };
        yield* scan(input);
        const reads = fixture.reads.length;
        commit = "b".repeat(40);
        yield* TestClock.adjust("5 minutes");
        expect((yield* scan(input))?.remote.commit).toBe(commit);
        expect(fixture.reads.length).toBeGreaterThan(reads);
        expect(fixture.reads.slice(reads).every((read) => read.revision === commit)).toBe(true);
      }).pipe(Effect.provide(fixture.dependencies));
    }),
  );

  it.effect("coalesces concurrent HEAD requests and scans", () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const fixture = yield* remoteFixture({
        files,
        beforeRead: Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
        ),
      });
      yield* Effect.gen(function* () {
        const scan = yield* makeRemoteMachineCache;
        const input = { url, cwd: fixture.root, repository: "." };
        const first = yield* Effect.forkChild(scan(input));
        yield* Deferred.await(started);
        const second = yield* Effect.forkChild(scan(input));
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(first)).toEqual(yield* Fiber.join(second));
        expect(fixture.commands).toHaveLength(1);
        expect(fixture.reads.filter((read) => read.path === ".nexi/machine.json")).toHaveLength(1);
      }).pipe(Effect.provide(fixture.dependencies));
    }),
  );

  it.effect.each([{ gitExitCode: 128 }, { gitOutput: "" }, {}])(
    "caches failed, empty and missing remote results: %#",
    (input) =>
      Effect.gen(function* () {
        const fixture = yield* remoteFixture(input);
        yield* Effect.gen(function* () {
          const scan = yield* makeRemoteMachineCache;
          const request = { url, cwd: fixture.root, repository: "." };
          yield* scan(request).pipe(Effect.result);
          const reads = fixture.reads.length;
          yield* scan(request).pipe(Effect.result);
          expect(fixture.commands).toHaveLength(1);
          expect(fixture.reads).toHaveLength(reads);
          yield* TestClock.adjust("5 minutes");
          yield* scan(request).pipe(Effect.result);
          expect(fixture.commands).toHaveLength(2);
          expect(fixture.reads).toHaveLength(reads);
        }).pipe(Effect.provide(fixture.dependencies));
      }),
  );

  it.effect("never performs network work in cached-only mode, even after expiry", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files });
      yield* Effect.gen(function* () {
        const scan = yield* makeRemoteMachineCache;
        const input = { url, cwd: fixture.root, repository: "." };
        expect(yield* scan(input, true)).toBeNull();
        expect(fixture.commands).toEqual([]);
        expect(fixture.reads).toEqual([]);
        yield* scan(input);
        const reads = fixture.reads.length;
        expect((yield* scan(input, true))?.candidates).toHaveLength(1);
        yield* TestClock.adjust("1 hour");
        expect(yield* scan(input, true)).toBeNull();
        expect(fixture.commands).toHaveLength(1);
        expect(fixture.reads).toHaveLength(reads);
      }).pipe(Effect.provide(fixture.dependencies));
    }),
  );

  it.effect("honours the shared provider pause before reading", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({ files });
      yield* Effect.gen(function* () {
        const limits = yield* SourceControlRateLimit.SourceControlRateLimit;
        const key = {
          provider: SourceControlProviderKind.make("github"),
          host: "nexplore.ghe.com",
        };
        yield* limits.recordRateLimit({ ...key, lease: yield* limits.check(key) });
        const scan = yield* makeRemoteMachineCache;
        const result = yield* scan({ url, cwd: fixture.root, repository: "." }).pipe(Effect.result);
        expect(result._tag).toBe("Failure");
        expect(fixture.reads).toEqual([]);
      }).pipe(Effect.provide(fixture.dependencies));
    }),
  );

  it.effect("backs off the whole host for the cache TTL after a rate-limit response", () =>
    Effect.gen(function* () {
      const fixture = yield* remoteFixture({
        readError: new PullRequestProviderError({
          provider: SourceControlProviderKind.make("github"),
          operation: "readFileAtRevision",
          reason: "rate-limited",
          detail: "test",
        }),
      });
      yield* Effect.gen(function* () {
        const scan = yield* makeRemoteMachineCache;
        const input = { url, cwd: fixture.root, repository: "." };
        yield* scan(input).pipe(Effect.result);
        yield* TestClock.adjust("4 minutes");
        yield* scan({ ...input, url: "https://nexplore.ghe.com/acme/other.git" }).pipe(
          Effect.result,
        );
        expect(fixture.reads).toHaveLength(1);
        yield* TestClock.adjust("1 minute");
        yield* scan(input).pipe(Effect.result);
        expect(fixture.reads).toHaveLength(2);
      }).pipe(Effect.provide(fixture.dependencies));
    }),
  );
});
