import { CloudSessionFailedError } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import { makeSessionReadCache, makeSingleFlight } from "./t3team-CloudSessionReadCache.ts";
import { jobStepsRequest, type CloudSessionRepoRef } from "./t3team-githubActionsSessionClient.ts";

const REPO: CloudSessionRepoRef = {
  host: "nexplore.ghe.com",
  owner: "hive",
  repo: "nx-nexi",
  workflowFileName: "session.yml",
};

/** Who is asking; a reference, so reading it needs nothing in the effect context. */
const Identity = Context.Reference<string>("test/Identity", { defaultValue: () => "nobody" });

const rest = (request: ReturnType<typeof jobStepsRequest>) => {
  if (request.kind !== "rest") throw new Error("expected a REST request");
  return request;
};

describe("makeSingleFlight", () => {
  it.effect("shares one execution among concurrent callers, then runs fresh again", () =>
    Effect.gen(function* () {
      let executions = 0;
      const gate = yield* Deferred.make<void>();
      const slow = Effect.gen(function* () {
        executions += 1;
        yield* Deferred.await(gate);
        return executions;
      });
      const shared = yield* makeSingleFlight(slow, Effect.succeed("pj"));

      const callers = yield* Effect.forEach(Array.from({ length: 5 }), () =>
        Effect.forkChild(shared),
      );
      yield* Effect.yieldNow;
      yield* Deferred.succeed(gate, undefined);
      const results = yield* Effect.forEach(callers, Fiber.join);

      assert.strictEqual(executions, 1);
      assert.deepStrictEqual(results, [1, 1, 1, 1, 1]);

      // Nothing is remembered once the flight ends: the next caller reads fresh.
      assert.strictEqual(yield* shared, 2);
    }),
  );

  it.effect("keeps running for the others when one caller walks away", () =>
    Effect.gen(function* () {
      let completions = 0;
      const gate = yield* Deferred.make<void>();
      const shared = yield* makeSingleFlight(
        Deferred.await(gate).pipe(Effect.tap(() => Effect.sync(() => (completions += 1)))),
        Effect.succeed("pj"),
      );

      const leaver = yield* Effect.forkChild(shared);
      const stayer = yield* Effect.forkChild(shared);
      yield* Effect.yieldNow;
      yield* Fiber.interrupt(leaver);
      yield* Deferred.succeed(gate, undefined);
      yield* Fiber.join(stayer);

      assert.strictEqual(completions, 1);
    }),
  );
});

describe("makeSingleFlight identity", () => {
  it.effect("never shares a flight between two credentials, only within one", () =>
    Effect.gen(function* () {
      const runs: string[] = [];
      const gate = yield* Deferred.make<void>();
      const shared = yield* makeSingleFlight(
        Effect.gen(function* () {
          const who = yield* Identity;
          runs.push(who);
          yield* Deferred.await(gate);
          return `list-of-${who}`;
        }),
        Identity,
      );

      const as = (who: string) =>
        Effect.forkChild(shared.pipe(Effect.provideService(Identity, who)));
      const callers = [yield* as("ann"), yield* as("bob"), yield* as("ann"), yield* as("bob")];
      yield* Effect.yieldNow;
      yield* Deferred.succeed(gate, undefined);
      const results = yield* Effect.forEach(callers, Fiber.join);

      assert.deepStrictEqual(results, ["list-of-ann", "list-of-bob", "list-of-ann", "list-of-bob"]);
      assert.deepStrictEqual([...runs].sort(), ["ann", "bob"]);
    }),
  );

  it.effect("shares nothing when the identity cannot be resolved", () =>
    Effect.gen(function* () {
      let runs = 0;
      const shared = yield* makeSingleFlight(
        Effect.sync(() => (runs += 1)),
        Effect.fail("no credential"),
      );
      yield* shared;
      yield* shared;
      assert.strictEqual(runs, 2);
    }),
  );
});

describe("makeSessionReadCache", () => {
  const okResponse = { body: "{}", truncated: false };

  it.effect("keeps a live run's steps briefly, and a settled run's steps for good", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      const read = yield* makeSessionReadCache((request) =>
        Effect.sync(() => {
          calls.push(request.kind === "rest" ? request.path : "graphql");
          return okResponse;
        }),
      );
      const live = rest(jobStepsRequest(REPO, 1));
      const settled = rest(jobStepsRequest(REPO, 2, true));

      yield* read(live);
      yield* read(live);
      yield* read(settled);
      yield* read(settled);
      assert.strictEqual(calls.length, 2);

      yield* TestClock.adjust("6 seconds");
      yield* read(live);
      yield* read(settled);
      assert.strictEqual(calls.length, 3, "only the live run is re-read");

      yield* TestClock.adjust("7 days");
      yield* read(settled);
      assert.strictEqual(calls.length, 3, "a settled run is never re-read");
    }),
  );

  it.effect("reads a re-run's steps afresh: the run id is reused, the attempt is not", () =>
    Effect.gen(function* () {
      const bodies: string[] = [];
      const read = yield* makeSessionReadCache(() =>
        Effect.sync(() => {
          bodies.push("read");
          return { body: `attempt-${bodies.length}`, truncated: false };
        }),
      );

      const first = yield* read(rest(jobStepsRequest(REPO, 9, true, 1)));
      const again = yield* read(rest(jobStepsRequest(REPO, 9, true, 1)));
      const rerun = yield* read(rest(jobStepsRequest(REPO, 9, true, 2)));

      assert.strictEqual(again.body, first.body);
      assert.notStrictEqual(rerun.body, first.body);
      assert.strictEqual(bodies.length, 2);
    }),
  );

  it.effect("does not serve a run's live steps as its settled steps", () =>
    Effect.gen(function* () {
      let calls = 0;
      const read = yield* makeSessionReadCache(() =>
        Effect.sync(() => {
          calls += 1;
          return okResponse;
        }),
      );

      yield* read(rest(jobStepsRequest(REPO, 7)));
      yield* read(rest(jobStepsRequest(REPO, 7, true)));
      assert.strictEqual(calls, 2);
    }),
  );

  it.effect("never keeps a failure or a truncated settled answer for long", () =>
    Effect.gen(function* () {
      let calls = 0;
      const read = yield* makeSessionReadCache(() => {
        calls += 1;
        return calls === 1
          ? Effect.fail(new CloudSessionFailedError({ reason: "unreachable", message: "down" }))
          : Effect.succeed({ body: "{", truncated: true });
      });
      const settled = rest(jobStepsRequest(REPO, 3, true));

      assert.isTrue((yield* Effect.exit(read(settled)))._tag === "Failure");
      yield* read(settled);
      assert.strictEqual(calls, 2, "a failure is retried at once");

      yield* TestClock.adjust("6 seconds");
      yield* read(settled);
      assert.strictEqual(calls, 3, "a truncated answer only gets the live lifetime");
    }),
  );
});
