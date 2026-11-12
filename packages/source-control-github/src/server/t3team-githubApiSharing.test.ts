import { assert, describe, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";

import * as GitHubApi from "./t3team-GitHubApi.ts";
import { jsonResponse, makeGitHubApiHarness } from "./t3team-githubApiTestHarness.ts";

class Connection extends Context.Service<
  Connection,
  { readonly api: GitHubApi.GitHubApi["Service"] }
>()("@t3tools/source-control-github/server/t3team-githubApiSharing.test/Connection") {}

const connectionLayer = Layer.effect(
  Connection,
  Effect.gen(function* () {
    return { api: yield* GitHubApi.GitHubApi };
  }),
);

const buildConnection = (transport: Layer.Layer<GitHubApi.GitHubApi>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(
      connectionLayer.pipe(Layer.provide(transport)),
      scope,
    );
    return Context.get(context, Connection).api;
  });

describe("one GitHubApi per process", () => {
  it.effect("handing the server's instance to each connection shares one read between them", () => {
    const { layer, sent } = makeGitHubApiHarness(() => jsonResponse({ login: "pj" }));
    return Effect.gen(function* () {
      const serverApi = yield* GitHubApi.GitHubApi;
      const transport = Layer.succeed(GitHubApi.GitHubApi, serverApi);
      const first = yield* buildConnection(transport);
      const second = yield* buildConnection(transport);
      assert.strictEqual(first, second);
      const read = { host: "github.com", operation: "viewer", path: "user" } as const;
      const coalesce = { ttl: "30 seconds" } as const;
      yield* first.rest({ ...read, coalesce });
      yield* second.rest({ ...read, coalesce });
      assert.strictEqual(sent("/user"), 1);
    }).pipe(Effect.provide(layer));
  });

  it.effect("rebuilding the transport layer for each connection gives each its own budget", () => {
    const { layer } = makeGitHubApiHarness(() => jsonResponse({}));
    return Effect.gen(function* () {
      const rebuilt = GitHubApi.GitHubApi.pipe(Effect.provide(layer));
      const first = yield* rebuilt;
      const second = yield* rebuilt;
      assert.notStrictEqual(first, second);
    });
  });

  it.effect("does not answer a read from one made under a smaller byte cap", () => {
    const { layer, sent } = makeGitHubApiHarness(() => jsonResponse({ login: "pj" }));
    return Effect.gen(function* () {
      const api = yield* GitHubApi.GitHubApi;
      const read = {
        host: "github.com",
        operation: "viewer",
        path: "user",
        coalesce: { ttl: "30 seconds" },
      } as const;
      yield* api.rest({ ...read, maxResponseBytes: 10 });
      yield* api.rest({ ...read, maxResponseBytes: 1_000_000 });
      assert.strictEqual(sent("/user"), 2);
    }).pipe(Effect.provide(layer));
  });
});
