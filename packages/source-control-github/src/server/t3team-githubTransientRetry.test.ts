import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";

import * as GitHubApi from "./t3team-GitHubApi.ts";
import * as GitHubCredentials from "./GitHubCredentials.ts";
import * as GitHubRest from "./GitHubRest.ts";
import * as GitHubQuota from "./GitHubQuota.ts";
import { appSignedOut, jsonResponse } from "./t3team-githubApiTestHarness.ts";

type Step = "dropped" | (() => Response);

const bad = () => jsonResponse({ errors: [{ message: "Something went wrong" }] }, { status: 502 });
const ok = () => jsonResponse({ data: { viewer: { login: "pj" } } });

/** The real transport answering from a script, one step per request actually sent. */
function scripted(steps: ReadonlyArray<Step>) {
  let sent = 0;
  const transport = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      const step = steps[Math.min(sent, steps.length - 1)]!;
      sent += 1;
      return step === "dropped"
        ? Effect.fail(
            new HttpClientError.HttpClientError({
              reason: new HttpClientError.TransportError({ request, cause: "terminated" }),
            }),
          )
        : Effect.succeed(HttpClientResponse.fromWeb(request, step()));
    }),
  );
  const credentials = Layer.succeed(
    GitHubCredentials.GitHubCredentials,
    GitHubCredentials.GitHubCredentials.of({
      get: (host) =>
        Effect.succeed({
          host,
          token: Redacted.make("token"),
          source: "gh" as const,
          fingerprint: `${host}:token`,
        }),
      saved: () => Effect.succeedNone,
      fingerprint: (host, token) => Effect.succeed(`${host}:${token}`),
      invalidate: () => Effect.void,
    }),
  );
  const layer = GitHubApi.layer.pipe(
    Layer.provideMerge(GitHubRest.layer),
    Layer.provideMerge(Layer.mergeAll(credentials, transport, appSignedOut)),
    Layer.provideMerge(GitHubQuota.layer),
    Layer.provideMerge(SourceControlRateLimit.layer),
  );
  return { layer, sent: () => sent };
}

const query = { host: "github.com", operation: "viewer", query: "query { viewer { login } }" };

/** Runs the read, lets every backoff pass, and reports what it ended as and how often it was sent. */
const attempt = (
  steps: ReadonlyArray<Step>,
  read: (api: GitHubApi.GitHubApi["Service"]) => Effect.Effect<unknown, GitHubApi.GitHubApiError>,
) => {
  const { layer, sent } = scripted(steps);
  return Effect.gen(function* () {
    const api = yield* GitHubApi.GitHubApi;
    const fiber = yield* read(api).pipe(Effect.exit, Effect.forkChild);
    yield* TestClock.adjust("10 seconds");
    const exit = yield* Fiber.join(fiber);
    return { exit, sent: sent() };
  }).pipe(Effect.provide(layer));
};

describe("transient GitHub failures", () => {
  it.effect("a query is sent again after a gateway error and then answered", () =>
    Effect.gen(function* () {
      const result = yield* attempt([bad, ok], (api) => api.graphql(query));
      assert.isTrue(result.exit._tag === "Success");
      assert.strictEqual(result.sent, 2);
    }),
  );

  it.effect("a REST read is sent again after a dropped connection", () =>
    Effect.gen(function* () {
      const result = yield* attempt(["dropped", ok], (api) =>
        api.rest({ host: "github.com", operation: "viewer", path: "user" }),
      );
      assert.isTrue(result.exit._tag === "Success");
      assert.strictEqual(result.sent, 2);
    }),
  );

  it.effect("gives up after two more tries and reports the last failure", () =>
    Effect.gen(function* () {
      const result = yield* attempt([bad], (api) => api.graphql(query));
      assert.strictEqual(result.sent, 3);
      assert.isTrue(result.exit._tag === "Failure");
    }),
  );

  it.effect("sends a mutation once, because sending it again could repeat it", () =>
    Effect.gen(function* () {
      const result = yield* attempt([bad, ok], (api) =>
        api.graphql({ ...query, query: "mutation { addStar(input: {}) { clientMutationId } }" }),
      );
      assert.strictEqual(result.sent, 1);
      assert.isTrue(result.exit._tag === "Failure");
    }),
  );

  it.effect("sends a write once", () =>
    Effect.gen(function* () {
      const result = yield* attempt(["dropped", ok], (api) =>
        api.rest({ host: "github.com", operation: "close", path: "x", method: "PATCH", body: {} }),
      );
      assert.strictEqual(result.sent, 1);
    }),
  );

  it.effect("does not retry an answer: not found, or a 500 that is not a gateway error", () =>
    Effect.gen(function* () {
      const missing = yield* attempt([() => jsonResponse({}, { status: 404 })], (api) =>
        api.rest({ host: "github.com", operation: "viewer", path: "nope" }),
      );
      const broken = yield* attempt([() => jsonResponse({}, { status: 500 })], (api) =>
        api.rest({ host: "github.com", operation: "viewer", path: "user" }),
      );
      assert.strictEqual(missing.sent, 1);
      assert.strictEqual(broken.sent, 1);
    }),
  );
});
