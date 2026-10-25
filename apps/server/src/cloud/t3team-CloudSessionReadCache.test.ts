import { CloudSessionFailedError } from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";

import { makeSessionReadCache, makeSingleFlight } from "./t3team-CloudSessionReadCache.ts";
import { jobStepsRequest, type CloudSessionRepoRef } from "@t3tools/shared/t3team-cloudSessionActionsRequests";

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

/** What the jobs endpoint answers while `attempt` is the run's latest. */
const jobsOfAttempt = (attempt: number) => ({
  body: JSON.stringify({ jobs: [{ run_attempt: attempt, steps: [] }] }),
  truncated: false,
});

/** A host whose runs are all on `latest.attempt` and that counts every read it serves. */
const makeHost = () => {
  const latest = { attempt: 1 };
  const calls: string[] = [];
  const execute = (request: { readonly kind: string; readonly path?: string }) =>
    Effect.sync(() => {
      calls.push(request.path ?? "graphql");
      return jobsOfAttempt(latest.attempt);
    });
  return { latest, calls, execute };
};

describe("makeSessionReadCache", () => {
  it.effect("keeps a live run's steps briefly, and a settled run's steps for good", () =>
    Effect.gen(function* () {
      const host = makeHost();
      const read = yield* makeSessionReadCache(host.execute);
      const live = rest(jobStepsRequest(REPO, 1));
      const settled = rest(jobStepsRequest(REPO, 2, true, 1));

      yield* read(live);
      yield* read(live);
      yield* read(settled);
      yield* read(settled);
      assert.strictEqual(host.calls.length, 2);

      yield* TestClock.adjust("6 seconds");
      yield* read(live);
      yield* read(settled);
      assert.strictEqual(host.calls.length, 3, "only the live run is re-read");

      yield* TestClock.adjust("7 days");
      yield* read(settled);
      assert.strictEqual(host.calls.length, 3, "a settled run is never re-read");
    }),
  );

  it.effect("reads a re-run's steps afresh: the run id is reused, the attempt is not", () =>
    Effect.gen(function* () {
      const host = makeHost();
      const read = yield* makeSessionReadCache(host.execute);

      yield* read(rest(jobStepsRequest(REPO, 9, true, 1)));
      yield* read(rest(jobStepsRequest(REPO, 9, true, 1)));
      host.latest.attempt = 2;
      const rerun = yield* read(rest(jobStepsRequest(REPO, 9, true, 2)));

      assert.strictEqual(rerun.body, jobsOfAttempt(2).body);
      assert.strictEqual(host.calls.length, 2);
    }),
  );

  it.effect(
    "does not keep a settled read whose jobs are a later attempt (re-run raced the read)",
    () =>
      Effect.gen(function* () {
        const host = makeHost();
        const read = yield* makeSessionReadCache(host.execute);
        const attempt1 = rest(jobStepsRequest(REPO, 5, true, 1));

        // The run was listed as settled on attempt 1, but a re-run began before the jobs answer.
        host.latest.attempt = 2;
        const raced = yield* Effect.exit(read(attempt1));
        assert.isTrue(raced._tag === "Failure", "attempt 2's steps are never read as attempt 1's");

        // Nothing was cached: once the host answers for attempt 1 again, it is read and then kept.
        host.latest.attempt = 1;
        yield* read(attempt1);
        yield* read(attempt1);
        assert.strictEqual(host.calls.length, 2);
      }),
  );

  it.effect("gives a run that does not name its attempt the live lifetime only", () =>
    Effect.gen(function* () {
      const host = makeHost();
      const read = yield* makeSessionReadCache(host.execute);
      const unnamed = rest(jobStepsRequest(REPO, 6, true));

      assert.strictEqual(unnamed.lifetime, "live");
      yield* read(unnamed);
      yield* read(unnamed);
      assert.strictEqual(host.calls.length, 1);

      yield* TestClock.adjust("6 seconds");
      yield* read(unnamed);
      assert.strictEqual(host.calls.length, 2, "re-read once the live lifetime is up");
    }),
  );

  it.effect("does not serve a run's live steps as its settled steps", () =>
    Effect.gen(function* () {
      const host = makeHost();
      const read = yield* makeSessionReadCache(host.execute);

      yield* read(rest(jobStepsRequest(REPO, 7)));
      yield* read(rest(jobStepsRequest(REPO, 7, true, 1)));
      assert.strictEqual(host.calls.length, 2);
    }),
  );

  it.effect("never keeps a failure or a truncated settled answer", () =>
    Effect.gen(function* () {
      let calls = 0;
      const read = yield* makeSessionReadCache(() => {
        calls += 1;
        return calls === 1
          ? Effect.fail(new CloudSessionFailedError({ reason: "unreachable", message: "down" }))
          : calls === 2
            ? Effect.succeed({ body: "{", truncated: true })
            : Effect.succeed(jobsOfAttempt(1));
      });
      const settled = rest(jobStepsRequest(REPO, 3, true, 1));

      assert.isTrue((yield* Effect.exit(read(settled)))._tag === "Failure");
      assert.isTrue((yield* Effect.exit(read(settled)))._tag === "Failure");
      yield* read(settled);
      assert.strictEqual(calls, 3, "each unreadable answer is retried at once");
    }),
  );
});
