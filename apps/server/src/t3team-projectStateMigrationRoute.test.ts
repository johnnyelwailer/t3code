/* oxlint-disable t3code/no-manual-effect-runtime-in-tests -- HTTP route integration bridges Effect for HttpClient assertions. */
// @effect-diagnostics nodeBuiltinImport:off - the fixture checkout is created with node fs.
// @effect-diagnostics missingEffectContext:off - route server boot is fully provided before runPromise.
// @effect-diagnostics unsafeEffectTypeAssertion:off - scoped HTTP test layer is provided before execution.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ProjectStateMigration } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { STATE_MIGRATION_RECORD_RELATIVE_PATH } from "./t3team-projectStateMigrationRecord.ts";
import { t3teamProjectStateMigrationStatusRouteLayer } from "./t3team-projectStateMigrationRoute.ts";

const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-state-migration-route-"));
afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

const runs = Layer.succeed(WorkflowRunRepository, {
  getById: () => Effect.succeedSome({ status: "completed" }),
} as never);

const routeTestLayer = HttpRouter.serve(t3teamProjectStateMigrationStatusRouteLayer, {
  disableListenLog: true,
  disableLogger: true,
}).pipe(Layer.provide(runs), Layer.provideMerge(NodeHttpServer.layerTest));

const runRouteTest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(Layer.mergeAll(routeTestLayer, NodeServices.layer)),
    ) as Effect.Effect<A, E, never>,
  );

const postStatus = (workspaceRoot: string) =>
  runRouteTest(
    Effect.gen(function* () {
      yield* Layer.build(routeTestLayer);
      const response = yield* (yield* HttpClient.HttpClient).post(
        "/api/t3team/project/main-repository/migration",
        { body: yield* HttpBody.json({ workspaceRoot }) },
      );
      return { status: response.status, body: (yield* response.json) as Record<string, unknown> };
    }),
  );

describe("POST /api/t3team/project/main-repository/migration", () => {
  it("answers null for a checkout with no migration", async () => {
    expect(await postStatus(root)).toEqual({ status: 200, body: { migration: null } });
  });

  it("returns the record, settled once its run has completed", async () => {
    const record: ProjectStateMigration = {
      migrationId: "m-1",
      status: "running",
      fromRoot: "/from",
      toRoot: root,
      stateDir: ".t3team",
      excludes: [],
      runId: "run-1",
      startedAt: "2026-10-11T00:00:00.000Z",
      updatedAt: "2026-10-11T00:00:00.000Z",
    };
    const file = NodePath.join(root, STATE_MIGRATION_RECORD_RELATIVE_PATH);
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, JSON.stringify(record));
    const response = await postStatus(root);
    expect(response.status).toBe(200);
    expect(response.body.migration).toMatchObject({ migrationId: "m-1", status: "completed" });
  });

  it("refuses a request without a workspace root", async () => {
    const response = await postStatus("  ");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body.error).toBe("workspaceRoot is required.");
  });
});
