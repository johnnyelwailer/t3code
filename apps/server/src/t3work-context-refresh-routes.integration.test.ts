/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics nodeBuiltinImport:off - HTTP route integration uses temp workspace files.
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "vite-plus/test";
import { T3WORK_CONTEXT_AVAILABILITY_FULL } from "@t3tools/project-context/t3workContextAvailability";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter } from "effect/unstable/http";

import {
  t3workProjectWorkspaceRefreshProjectContextRouteLayer,
  t3workProjectWorkspaceRefreshWorkItemContextRouteLayer,
  t3workProjectWorkspaceRefreshWorkItemSliceContextRouteLayer,
} from "./t3work-context-refresh-routes.ts";
import {
  makeContextRefreshIntegrationTestLayer,
  makeContextRefreshScopeTestLayer,
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
} from "./t3work-contextRefreshTestFixtures.ts";

registerContextRefreshTestCleanup();

const makeRouteHttpTestLayer = (prefix: string) =>
  HttpRouter.serve(
    Layer.mergeAll(
      t3workProjectWorkspaceRefreshProjectContextRouteLayer,
      t3workProjectWorkspaceRefreshWorkItemContextRouteLayer,
      t3workProjectWorkspaceRefreshWorkItemSliceContextRouteLayer,
      makeContextRefreshIntegrationTestLayer(prefix),
      makeContextRefreshScopeTestLayer(),
    ),
    { disableListenLog: true, disableLogger: true },
  ).pipe(Layer.provideMerge(NodeHttpServer.layerTest));

const runRouteHttpTest = <A, E, R>(prefix: string, effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(makeRouteHttpTestLayer(prefix)),
      Effect.provide(NodeServices.layer),
    ) as Effect.Effect<A, E, never>,
  );

describe("context refresh HTTP routes", () => {
  it("POST context-refresh/work-item returns synced bundle metadata", async () => {
    await runRouteHttpTest(
      "t3work-context-refresh-route-",
      Effect.gen(function* () {
        const { root, project } = makeContextRefreshTestWorkspace();
        yield* Layer.build(makeRouteHttpTestLayer("t3work-context-refresh-route-"));
        const httpClient = yield* HttpClient.HttpClient;

        const response = yield* httpClient.post(
          "/api/t3work/project/workspace/context-refresh/work-item",
          {
            body: yield* HttpBody.json({
              projectId: project.id,
              workspaceRoot: root,
              ticketKey: "AC-91",
            }),
          },
        );
        const body = (yield* response.json) as {
          readonly status?: string;
          readonly entryPointRelativePath?: string;
          readonly availability?: string;
        };

        expect(response.status).toBe(200);
        expect(body.status).toBe("synced");
        expect(body.availability).toBe(T3WORK_CONTEXT_AVAILABILITY_FULL);
        expect(NodeFS.existsSync(NodePath.join(root, body.entryPointRelativePath ?? ""))).toBe(
          true,
        );
      }),
    );
  });

  it("POST context-refresh/project returns synced bundle metadata", async () => {
    await runRouteHttpTest(
      "t3work-context-refresh-project-route-",
      Effect.gen(function* () {
        const { root, project } = makeContextRefreshTestWorkspace();
        yield* Layer.build(makeRouteHttpTestLayer("t3work-context-refresh-project-route-"));
        const httpClient = yield* HttpClient.HttpClient;

        const response = yield* httpClient.post(
          "/api/t3work/project/workspace/context-refresh/project",
          {
            body: yield* HttpBody.json({
              projectId: project.id,
              workspaceRoot: root,
            }),
          },
        );
        const body = (yield* response.json) as {
          readonly status?: string;
          readonly entryPointRelativePath?: string;
          readonly availability?: string;
          readonly workItemCount?: number;
        };

        expect(response.status).toBe(200);
        expect(body.status).toBe("synced");
        expect(body.availability).toBe("summary");
        expect(body.workItemCount).toBeGreaterThan(0);
        expect(NodeFS.existsSync(NodePath.join(root, body.entryPointRelativePath ?? ""))).toBe(
          true,
        );

        const cached = yield* httpClient.post(
          "/api/t3work/project/workspace/context-refresh/project",
          {
            body: yield* HttpBody.json({
              projectId: project.id,
              workspaceRoot: root,
            }),
          },
        );
        const cachedBody = (yield* cached.json) as { readonly status?: string };
        expect(cachedBody.status).toBe("already_synced");
      }),
    );
  });

  it("POST context-refresh/work-item rejects missing required fields", async () => {
    await runRouteHttpTest(
      "t3work-context-refresh-route-err-",
      Effect.gen(function* () {
        yield* Layer.build(makeRouteHttpTestLayer("t3work-context-refresh-route-err-"));
        const httpClient = yield* HttpClient.HttpClient;

        const response = yield* httpClient.post(
          "/api/t3work/project/workspace/context-refresh/work-item",
          {
            body: yield* HttpBody.json({ workspaceRoot: "/tmp", ticketKey: "AC-91" }),
          },
        );
        const body = (yield* response.json) as { readonly error?: string };

        expect(response.status).toBe(502);
        expect(body.error ?? "").toMatch(/workspaceRoot, projectId, and ticketKey are required/);
      }),
    );
  });

  it("POST context-refresh/work-item-slice writes a focus entrypoint", async () => {
    await runRouteHttpTest(
      "t3work-context-refresh-slice-route-",
      Effect.gen(function* () {
        const { root, project } = makeContextRefreshTestWorkspace();
        yield* Layer.build(makeRouteHttpTestLayer("t3work-context-refresh-slice-route-"));
        const httpClient = yield* HttpClient.HttpClient;

        const response = yield* httpClient.post(
          "/api/t3work/project/workspace/context-refresh/work-item-slice",
          {
            body: yield* HttpBody.json({
              projectId: project.id,
              workspaceRoot: root,
              ticketKey: "AC-91",
              focusKind: "jira-ticket-comments",
              focusLabel: "Comments",
              summaryItems: [{ label: "Count", value: "4" }],
            }),
          },
        );
        const body = (yield* response.json) as {
          readonly status?: string;
          readonly focusEntryPointRelativePath?: string;
          readonly availability?: string;
        };

        expect(response.status).toBe(200);
        expect(body.status).toBe("synced");
        expect(body.availability).toBe(T3WORK_CONTEXT_AVAILABILITY_FULL);
        expect(body.focusEntryPointRelativePath).toContain("/focus/jira-ticket-comments.json");
        expect(NodeFS.existsSync(NodePath.join(root, body.focusEntryPointRelativePath ?? ""))).toBe(
          true,
        );
      }),
    );
  });
});
