/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics nodeBuiltinImport:off - the registry parity check reads the two server sources.
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/**
 * The description-apply route: that it is REACHABLE, and that it stays reachable.
 *
 * A route in this repo has to be registered in TWO places — `makeT3TeamRoutesLayer` in
 * `t3team-server.ts` AND the merge list in `server.ts` — and forgetting the second is a documented
 * trap that produces a silent 404 in the running app while every unit test stays green. This route
 * avoids the trap by joining `t3teamAtlassianBacklogRouteLayer`, which both registries already list;
 * the parity test below is what keeps that true for it and for every sibling.
 */

import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";

import { t3teamAtlassianBacklogRouteLayer } from "./t3team-atlassian-backlog-routes.ts";

const routeTestLayer = HttpRouter.serve(t3teamAtlassianBacklogRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const runRouteTest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(Layer.mergeAll(routeTestLayer, NodeServices.layer)),
    ) as Effect.Effect<A, E, never>,
  );

const serverSourcePath = (file: string) =>
  NodePath.join(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), file);

/** The route-layer identifiers a registry merges, in order. */
function mergedRouteLayers(file: string): ReadonlyArray<string> {
  const source = NodeFS.readFileSync(serverSourcePath(file), "utf8");
  return [...source.matchAll(/^ {2}(t3team[A-Za-z]*RouteLayer),$/gm)].map((match) => match[1]!);
}

describe("POST /api/t3team/atlassian/issue/update-description", () => {
  it("is reachable and reports a refusal rather than 404", async () => {
    await runRouteTest(
      Effect.gen(function* () {
        yield* Layer.build(routeTestLayer);
        const httpClient = yield* HttpClient.HttpClient;
        const response = yield* httpClient.post("/api/t3team/atlassian/issue/update-description", {
          body: yield* HttpBody.json({
            accountId: "https://test.atlassian.net",
            issueIdOrKey: "PROJ-9",
            description: "   ",
          }),
        });
        const body = (yield* response.json) as { readonly error?: string };

        // 404 here would mean the route never registered; 502 with this message means the handler
        // ran and mapped its error exactly like the sibling writes do.
        expect(response.status).toBe(502);
        expect(body.error).toBe("Refusing to write an empty description.");
      }),
    );
  });

  it("rides a route layer BOTH registries merge, so it cannot 404 in the running app", () => {
    const forkRegistry = mergedRouteLayers("t3team-server.ts");
    const upstreamRegistry = mergedRouteLayers("server.ts");

    expect(forkRegistry).toContain("t3teamAtlassianBacklogRouteLayer");
    // Same set in both, so a future route added to one registry alone fails HERE instead of in
    // production. Order is not asserted — merge order is not behaviour.
    expect([...forkRegistry].sort()).toEqual([...upstreamRegistry].sort());
  });
});
