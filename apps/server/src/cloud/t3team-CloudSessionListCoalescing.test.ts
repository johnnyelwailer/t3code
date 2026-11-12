import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as ConnectCredentialMinter from "./t3team-ConnectCredentialMinter.ts";
import * as NexiBrokerService from "./t3team-NexiBrokerService.ts";
import * as CloudSessionService from "./t3team-CloudSessionService.ts";
import { CloudSessionMachines } from "./t3team-CloudSessionMachine.ts";

const run = (id: number, status: string, conclusion: string | null, actor = "pj") => ({
  id,
  status,
  conclusion,
  created_at: "2026-09-14T12:00:00Z",
  updated_at: "2026-09-14T12:00:01Z",
  html_url: `https://nexplore.ghe.com/hive/nx-nexi/actions/runs/${id}`,
  name: `hive/nx-nexi [main] [s${id}]`,
  actor: { login: actor },
});

const respond = (body: unknown): GitHubApi.GitHubRestResponse => ({
  status: 200,
  headers: {},
  body: JSON.stringify(body),
  truncated: false,
  invalidUtf8: false,
});

/** A fake GHE host that counts every request and can hold the run listing open. */
/** The credential a request carries: the pinned one when set, else the ambient `pj`. */
const callerOf = Effect.gen(function* () {
  const pinned = yield* GitHubApi.PinnedGitHubCredential;
  return pinned?.credentialFingerprint ?? "pj";
});

const pin = (who: string) =>
  Effect.provideService(GitHubApi.PinnedGitHubCredential, {
    host: "nexplore.ghe.com",
    token: Redacted.make(`token-${who}`),
    credentialFingerprint: who,
  });

const makeHost = (runs: ReadonlyArray<ReturnType<typeof run>>) => {
  const counts = new Map<string, number>();
  let gate: Deferred.Deferred<void> | null = null;
  const rest: GitHubApi.GitHubApi["Service"]["rest"] = (input) =>
    Effect.gen(function* () {
      counts.set(input.operation, (counts.get(input.operation) ?? 0) + 1);
      if (input.operation === "cloudSession.listRuns" && gate !== null) {
        yield* Deferred.await(gate);
      }
      if (input.operation === "cloudSession.viewer") return respond({ login: yield* callerOf });
      if (input.operation === "cloudSession.listRuns") return respond({ workflow_runs: runs });
      return respond({
        jobs: [{ steps: [{ name: "Set up job", status: "in_progress", conclusion: null }] }],
      });
    });
  return {
    rest,
    count: (operation: string) => counts.get(operation) ?? 0,
    /** Hold every run listing open until `release` is completed. */
    holdListings: (release: Deferred.Deferred<void>) => {
      gate = release;
    },
  };
};

const serviceFor = (rest: GitHubApi.GitHubApi["Service"]["rest"]) => {
  const providers = Layer.mergeAll(
    Layer.mock(CloudSessionMachines)({
      resolve: () => Effect.die("plain sessions only"),
      resolveSetup: () => Effect.die("plain sessions only"),
      poolKeyOf: () => Effect.succeed(null),
    }),
    Layer.mock(GitHubApi.GitHubApi)({
      rest,
      graphql: () => Effect.succeed("{}"),
      credential: () =>
        callerOf.pipe(
          Effect.map((fingerprint) => ({ token: Redacted.make("token"), fingerprint })),
        ),
    }),
    Layer.mock(CliTokenManager.CloudCliTokenManager)({
      getExisting: Effect.succeed(Option.none()),
    }),
    Layer.mock(ConnectCredentialMinter.ConnectCredentialMinter)({
      mint: () => Effect.die("no mint on list"),
    }),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: {} })),
    NexiBrokerService.layerDisabled,
  );
  return CloudSessionService.layer.pipe(Layer.provide(providers));
};

describe("CloudSessionService.list GHE call volume", () => {
  it.effect("coalesces concurrent list callers onto one GHE fan-out", () => {
    const host = makeHost([run(1, "in_progress", null), run(2, "completed", "success")]);
    return Effect.gen(function* () {
      const gate = yield* Deferred.make<void>();
      host.holdListings(gate);
      const svc = yield* Effect.service(CloudSessionService.CloudSessionService);

      const callers = yield* Effect.forEach(Array.from({ length: 6 }), () =>
        Effect.forkChild(svc.list),
      );
      yield* Effect.yieldNow;
      yield* Deferred.succeed(gate, undefined);
      const results = yield* Effect.forEach(callers, Fiber.join);

      assert.strictEqual(host.count("cloudSession.viewer"), 1);
      assert.strictEqual(host.count("cloudSession.listRuns"), 1);
      // Only the moving run costs a steps read; the settled one costs none.
      assert.strictEqual(host.count("cloudSession.jobSteps"), 1);
      for (const result of results) {
        assert.deepStrictEqual(
          result.sessions.map((session) => session.sessionId),
          ["1", "2"],
        );
      }

      // The flight is over: a later list reads the host again rather than a stale answer.
      yield* svc.list;
      assert.strictEqual(host.count("cloudSession.listRuns"), 2);
    }).pipe(Effect.provide(serviceFor(host.rest)));
  });

  it.effect(
    "keeps two credentials' concurrent lists apart: two fan-outs, each its own sessions",
    () => {
      const host = makeHost([
        run(1, "completed", "success", "ann"),
        run(2, "completed", "success", "bob"),
      ]);
      return Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        host.holdListings(gate);
        const svc = yield* Effect.service(CloudSessionService.CloudSessionService);

        const ann = yield* Effect.forkChild(svc.list.pipe(pin("ann")));
        const bob = yield* Effect.forkChild(svc.list.pipe(pin("bob")));
        const ann2 = yield* Effect.forkChild(svc.list.pipe(pin("ann")));
        yield* Effect.yieldNow;
        yield* Deferred.succeed(gate, undefined);
        const [forAnn, forBob, forAnnToo] = yield* Effect.forEach([ann, bob, ann2], Fiber.join);

        // One fan-out per credential: ann's two callers share one, bob does not wait on it.
        assert.strictEqual(host.count("cloudSession.listRuns"), 2);
        assert.deepStrictEqual(
          forAnn?.sessions.map((session) => session.sessionId),
          ["1"],
        );
        assert.deepStrictEqual(
          forAnnToo?.sessions.map((session) => session.sessionId),
          ["1"],
        );
        assert.deepStrictEqual(
          forBob?.sessions.map((session) => session.sessionId),
          ["2"],
        );
      }).pipe(Effect.provide(serviceFor(host.rest)));
    },
  );

  it.effect("never answers one credential's login from another's memo", () => {
    const host = makeHost([
      run(1, "completed", "success", "ann"),
      run(2, "completed", "success", "bob"),
    ]);
    return Effect.gen(function* () {
      const svc = yield* Effect.service(CloudSessionService.CloudSessionService);

      const forAnn = yield* svc.list.pipe(pin("ann"));
      const forBob = yield* svc.list.pipe(pin("bob"));
      yield* svc.list.pipe(pin("ann"));

      assert.deepStrictEqual(
        forAnn.sessions.map((session) => session.sessionId),
        ["1"],
      );
      assert.deepStrictEqual(
        forBob.sessions.map((session) => session.sessionId),
        ["2"],
      );
      // Each credential asked GitHub who it is once; ann's second list used her own memo.
      assert.strictEqual(host.count("cloudSession.viewer"), 2);
    }).pipe(Effect.provide(serviceFor(host.rest)));
  });
});
