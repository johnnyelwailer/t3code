/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
/**
 * The digest routes' arrangement: the graph route carries the stored layout, an arrangement change
 * changes the poll answer (it is in the fingerprint), and the reset route clears it. The digest
 * loader itself is stubbed — it needs the whole app context and has its own tests.
 */

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";

import type { OrchestrationProjectShell } from "@t3tools/contracts";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { t3teamMyWorkDigestRouteLayer } from "./t3team-myworkDigest-routes.ts";
import { digestArrangementKey, storeDigestArrangement } from "./t3team-myworkDigestArrangement.ts";
import type { T3TeamMyWorkDigestInput } from "./t3team-myworkDigestTypes.ts";

vi.mock("./t3team-myworkDigest.ts", () => ({
  loadT3TeamMyWorkDigestGraph: () =>
    Effect.succeed({ scope: "project", projects: [], viewer: { name: "Pat" } }),
}));

const routeTestLayer = HttpRouter.serve(t3teamMyWorkDigestRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(SqlitePersistenceMemory),
  // The reset route resolves identity from the server's own bindings, not the request body.
  Layer.provideMerge(
    Layer.succeed(ProjectStoreV2, {
      listShells: () =>
        Effect.succeed([
          {
            id: "app-1",
            title: "IES NG",
            source: { provider: "atlassian", accountId: "acct-1", externalProjectId: "IES" },
          } as unknown as OrchestrationProjectShell,
        ]),
    } as unknown as ProjectStoreV2["Service"]),
  ),
);

const runRouteTest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(Layer.mergeAll(routeTestLayer, NodeServices.layer)),
    ) as Effect.Effect<A, E, never>,
  );

const input: T3TeamMyWorkDigestInput = {
  scope: "project",
  projects: [
    {
      account: { id: "acct-1", provider: "atlassian" },
      externalProjectId: "IES",
      appProjectId: "app-1",
    },
  ],
};

const plan = (heading: string) => ({
  producer: "agent",
  producedAt: "2026-10-06T08:00:00.000Z",
  sections: [
    {
      id: "now",
      kind: "items",
      placement: "main",
      heading,
      items: [{ ticketId: "t-1" }],
    },
  ],
});

type PollBody = {
  readonly unchanged: boolean;
  readonly fingerprint: string;
  readonly value?: {
    readonly arrangement?: { readonly sections: ReadonlyArray<{ heading: string }> };
  };
};

describe("My Work digest arrangement over HTTP", () => {
  it("serves the stored arrangement, re-answers a changed poll, and resets", async () => {
    await runRouteTest(
      Effect.gen(function* () {
        yield* Layer.build(routeTestLayer);
        const http = yield* HttpClient.HttpClient;
        const post = (path: string, body: unknown) =>
          http.post(path, { body: HttpBody.jsonUnsafe(body) });
        const key = digestArrangementKey(input)!;

        const bare = yield* (yield* post("/api/t3team/mywork-digest/graph", input)).json;
        expect((bare as { payload: object }).payload).not.toHaveProperty("arrangement");

        yield* storeDigestArrangement(key.identity, key.scope, plan("First"));
        const graph = (yield* (yield* post("/api/t3team/mywork-digest/graph", input)).json) as {
          payload: { arrangement?: { sections: ReadonlyArray<{ heading: string }> } };
        };
        expect(graph.payload.arrangement?.sections[0]?.heading).toBe("First");

        // Poll round 1 hands out a fingerprint; round 2 with it is unchanged...
        const first = (yield* (yield* post("/api/t3team/mywork-digest/graph/poll", {
          ...input,
          poll: {},
        })).json) as PollBody;
        expect(first.unchanged).toBe(false);
        expect(first.value?.arrangement?.sections[0]?.heading).toBe("First");
        const same = (yield* (yield* post("/api/t3team/mywork-digest/graph/poll", {
          ...input,
          poll: { knownFingerprint: first.fingerprint },
        })).json) as PollBody;
        expect(same.unchanged).toBe(true);

        // ...until the arrangement changes: that alone makes the digest CHANGED.
        yield* storeDigestArrangement(key.identity, key.scope, plan("Second"));
        const changed = (yield* (yield* post("/api/t3team/mywork-digest/graph/poll", {
          ...input,
          poll: { knownFingerprint: first.fingerprint },
        })).json) as PollBody;
        expect(changed.unchanged).toBe(false);
        expect(changed.value?.arrangement?.sections[0]?.heading).toBe("Second");

        const reset = yield* post("/api/t3team/mywork-digest/arrangement/reset", input);
        expect(reset.status).toBe(200);
        const after = yield* (yield* post("/api/t3team/mywork-digest/graph", input)).json;
        expect((after as { payload: object }).payload).not.toHaveProperty("arrangement");
      }),
    );
  });

  it("refuses a reset that names no project", async () => {
    await runRouteTest(
      Effect.gen(function* () {
        yield* Layer.build(routeTestLayer);
        const http = yield* HttpClient.HttpClient;
        const response = yield* http.post("/api/t3team/mywork-digest/arrangement/reset", {
          body: HttpBody.jsonUnsafe({ scope: "project", projects: [] }),
        });
        expect(response.status).toBe(400);
      }),
    );
  });
});
