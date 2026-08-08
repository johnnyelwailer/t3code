/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics nodeBuiltinImport:off - the registry parity check reads the two server sources.
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/**
 * The description-apply route: that it is REACHABLE, and that it stays reachable.
 *
 * A route used to need registering in TWO places — `makeT3TeamRoutesLayer` in `t3team-server.ts`
 * AND the merge list in `server.ts` — and forgetting the second produced a silent 404 in the
 * running app while every unit test stayed green. The duplicate registry is gone (2026-08 upstream
 * sync collapsed the two servers), so `server.ts` is the single registry; this route joins
 * `t3teamAtlassianBacklogRouteLayer`, and the parity test below still guards reachability.
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
/**
 * The t3team route layers actually merged into `makeRoutesLayer`.
 *
 * Scoped to that declaration on purpose: matching the whole file would also match the import
 * list, and then "is this route registered?" would pass for a route that is merely IMPORTED —
 * exactly the silent 404 this test exists to prevent. Indentation is not asserted either, since
 * the entries sit inside nested `Layer.mergeAll(...)` groups (the merge helper is arity-capped).
 */
function mergedRouteLayers(file: string): ReadonlyArray<string> {
  const source = NodeFS.readFileSync(serverSourcePath(file), "utf8");
  const start = source.indexOf("export const makeRoutesLayer");
  if (start === -1) throw new Error(`${file}: makeRoutesLayer declaration not found`);
  const end = source.indexOf("\n).pipe(", start);
  if (end === -1) throw new Error(`${file}: end of makeRoutesLayer not found`);
  const registry = source.slice(start, end);
  return [...registry.matchAll(/^\s*(t3team[A-Za-z]*RouteLayer),$/gm)].map((match) => match[1]!);
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

  it("rides a route layer the registry merges, so it cannot 404 in the running app", () => {
    // There is ONE registry now. The parity half of this test (fork registry vs upstream registry)
    // went away with `t3team-server.ts` in the 2026-08 upstream sync — that file was a copy of
    // `server.ts`, and the two drifting apart was the very failure this guarded. What still needs
    // guarding is that the layer this route joins is actually merged into the running app.
    const registry = mergedRouteLayers("server.ts");

    expect(registry).toContain("t3teamAtlassianBacklogRouteLayer");
    // Canary that the extraction still sees the registry: if a refactor changes how route layers
    // are listed, this drops toward 0 and fails here rather than passing vacuously.
    expect(registry.length).toBeGreaterThan(20);
    // And that it is the REGISTRY, not the import list: imports are `import { x } from "y";`,
    // never a bare `x,` entry, so a stray import cannot satisfy the check above.
    expect(registry).not.toContain("t3teamAtlassianRouteLayerThatDoesNotExist");
  });
});
