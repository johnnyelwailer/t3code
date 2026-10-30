/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/** The field-update route: reachable, and it refuses a malformed body before any Jira call. */

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";

import { t3teamAtlassianIssueContentRouteLayer } from "./t3team-atlassian-issue-content-routes.ts";

const routeTestLayer = HttpRouter.serve(t3teamAtlassianIssueContentRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const post = (body: unknown) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Layer.build(routeTestLayer);
        const httpClient = yield* HttpClient.HttpClient;
        const response = yield* httpClient.post("/api/t3team/atlassian/issue/update-fields", {
          body: yield* HttpBody.json(body),
        });
        return { status: response.status, body: (yield* response.json) as { error?: string } };
      }),
    ).pipe(Effect.provide(Layer.mergeAll(routeTestLayer, NodeServices.layer))) as Effect.Effect<
      { status: number; body: { error?: string } },
      never,
      never
    >,
  );

describe("POST /api/t3team/atlassian/issue/update-fields", () => {
  it.each([
    ["no account", { issueIdOrKey: "PROJ-9", priority: "High" }],
    ["a non-array label list", { accountId: "a", issueIdOrKey: "PROJ-9", labels: { add: "bug" } }],
  ])("refuses %s with the handler's own error, not a 404", async (_name, body) => {
    const { status, body: response } = await post(body);
    // A 404 would mean the route never registered; this message means the handler ran and decoded.
    expect(status).toBe(502);
    expect(response.error).toBe("Invalid work item field update.");
  });
});
