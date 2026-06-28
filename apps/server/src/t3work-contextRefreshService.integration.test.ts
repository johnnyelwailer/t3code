// @effect-diagnostics nodeBuiltinImport:off - integration test uses real temp files.
// @effect-diagnostics preferSchemaOverJson:off - fixture JSON keeps the test compact.
import { assert, it } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
import { T3WORK_CONTEXT_AVAILABILITY_FULL } from "@t3tools/project-context/t3workContextAvailability";
import type { IntegrationProvider } from "@t3tools/integrations-core";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";

import { ensureT3workContextCacheTables } from "./t3work-context-cache-tables.ts";
import { loadT3workContextRefreshJob } from "./t3work-context-refresh-jobs.ts";
import { buildT3workForegroundContextGraph } from "./t3work-contextRefreshGraph.ts";
import { T3workContextRefreshService } from "./t3work-contextRefreshService.ts";
import {
  makeContextRefreshIntegrationTestLayer,
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
} from "./t3work-contextRefreshTestFixtures.ts";

registerContextRefreshTestCleanup();

it.effect("refreshes a work-item bundle server-side without browser sync", () =>
  Effect.gen(function* () {
    const { root, project } = makeContextRefreshTestWorkspace();
    const service = yield* T3workContextRefreshService;
    const input = {
      threadId: ThreadId.make("thread-1"),
      projectId: project.id,
      workspaceRoot: root,
      ticketKey: "AC-91",
      force: false,
    };

    const refreshed = yield* service.refreshWorkItem(input);
    assert.equal(refreshed.status, "synced");
    assert.equal(refreshed.availability, T3WORK_CONTEXT_AVAILABILITY_FULL);
    assert.equal(refreshed.includedCount, 1);

    const entrypointPath = NodePath.join(root, refreshed.entryPointRelativePath);
    const manifestPath = NodePath.join(root, refreshed.manifestRelativePath);
    const entrypoint = JSON.parse(NodeFS.readFileSync(entrypointPath, "utf8")) as {
      readonly availability?: string;
      readonly key?: string;
    };
    assert.equal(entrypoint.availability, T3WORK_CONTEXT_AVAILABILITY_FULL);
    assert.equal(entrypoint.key, "AC-91");
    assert.isTrue(NodeFS.existsSync(manifestPath));
    assert.isTrue(NodeFS.existsSync(NodePath.join(root, ".t3work/context/.sync-commit.json")));

    const cached = yield* service.refreshWorkItem(input);
    assert.equal(cached.status, "already_synced");
    assert.equal(cached.entryPointRelativePath, refreshed.entryPointRelativePath);
  }).pipe(
    Effect.provide(makeContextRefreshIntegrationTestLayer("t3work-context-refresh-service-")),
  ),
);

it.effect("builds a multi-node foreground graph for linked mock issues", () =>
  Effect.gen(function* () {
    const { project } = makeContextRefreshTestWorkspace();
    yield* ensureT3workContextCacheTables();
    const snapshots = new Map([
      [
        "ac-91",
        {
          ref: {
            provider: "atlassian",
            kind: "issue",
            id: "ac-91",
            displayId: "AC-91",
            title: "AC-91",
            projectId: project.source.externalProjectId!,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          fetchedAt: "2026-01-01T00:00:00.000Z",
          fields: {},
          raw: { fields: { subtasks: [{ key: "ac-92" }] } },
        },
      ],
      [
        "ac-92",
        {
          ref: {
            provider: "atlassian",
            kind: "issue",
            id: "ac-92",
            displayId: "AC-92",
            title: "AC-92",
            projectId: project.source.externalProjectId!,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          fetchedAt: "2026-01-01T00:00:00.000Z",
          fields: {},
          raw: {},
        },
      ],
    ]);
    const provider = {
      getResource: async (ref: { id: string }) => {
        const item = snapshots.get(ref.id.toLowerCase());
        if (!item) throw new Error(`missing ${ref.id}`);
        return item;
      },
    } as IntegrationProvider;
    const graph = yield* buildT3workForegroundContextGraph({
      project,
      provider,
      rootKey: "ac-91",
    });
    assert.deepStrictEqual(
      graph.nodes.map((node) => node.key),
      ["AC-91", "AC-92"],
    );
  }).pipe(Effect.provide(makeContextRefreshIntegrationTestLayer("t3work-context-refresh-graph-"))),
);

it.effect("persists background refresh jobs after a foreground sync", () =>
  Effect.gen(function* () {
    const { root, project } = makeContextRefreshTestWorkspace();
    const service = yield* T3workContextRefreshService;
    const refreshed = yield* service.refreshWorkItem({
      threadId: ThreadId.make("thread-bg"),
      projectId: project.id,
      workspaceRoot: root,
      ticketKey: "AC-91",
      force: false,
    });
    assert.isDefined(refreshed.backgroundJobId);
    const job = yield* loadT3workContextRefreshJob(refreshed.backgroundJobId!);
    assert.isDefined(job);
    assert.equal(job!.rootKey, refreshed.ticketKey.toUpperCase());
  }).pipe(Effect.provide(makeContextRefreshIntegrationTestLayer("t3work-context-refresh-bg-"))),
);

it.effect("completes background refresh jobs after a foreground sync", () =>
  Effect.gen(function* () {
    const { root, project } = makeContextRefreshTestWorkspace();
    const service = yield* T3workContextRefreshService;
    const refreshed = yield* service.refreshWorkItem({
      threadId: ThreadId.make("thread-bg-complete"),
      projectId: project.id,
      workspaceRoot: root,
      ticketKey: "AC-91",
      force: false,
    });
    assert.isDefined(refreshed.backgroundJobId);
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const job = yield* loadT3workContextRefreshJob(refreshed.backgroundJobId!);
      if (job?.status === "completed") {
        return;
      }
      yield* Effect.yieldNow;
    }
    const finalJob = yield* loadT3workContextRefreshJob(refreshed.backgroundJobId!);
    assert.strictEqual(finalJob?.status, "completed");
  }).pipe(
    Effect.provide(makeContextRefreshIntegrationTestLayer("t3work-context-refresh-bg-complete-")),
  ),
);

it.effect("force refresh supersedes an in-flight refresh for the same ticket", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { root, project } = makeContextRefreshTestWorkspace();
      const service = yield* T3workContextRefreshService;
      const input = {
        threadId: ThreadId.make("thread-force"),
        projectId: project.id,
        workspaceRoot: root,
        ticketKey: "AC-91",
        force: false,
      };
      const leader = yield* service.refreshWorkItem(input).pipe(Effect.forkScoped);
      const waiter = yield* service.refreshWorkItem(input).pipe(Effect.forkScoped);
      const forced = yield* service
        .refreshWorkItem({ ...input, force: true })
        .pipe(Effect.forkScoped);
      const waiterExit = yield* Fiber.await(waiter);
      assert.isTrue(Exit.isFailure(waiterExit));
      if (Exit.isFailure(waiterExit)) {
        assert.match(String(Cause.squash(waiterExit.cause)), /superseded/i);
      }
      const forcedResult = yield* Fiber.join(forced);
      assert.equal(forcedResult.status, "synced");
      yield* Fiber.interrupt(leader);
    }),
  ).pipe(Effect.provide(makeContextRefreshIntegrationTestLayer("t3work-context-refresh-force-"))),
);

it.effect("force refresh rebuilds an already_synced bundle", () =>
  Effect.gen(function* () {
    const { root, project } = makeContextRefreshTestWorkspace();
    const service = yield* T3workContextRefreshService;
    const input = {
      threadId: ThreadId.make("thread-force-rebuild"),
      projectId: project.id,
      workspaceRoot: root,
      ticketKey: "AC-91",
      force: false,
    };
    yield* service.refreshWorkItem(input);
    const forced = yield* service.refreshWorkItem({ ...input, force: true });
    assert.equal(forced.status, "synced");
    assert.isTrue(NodeFS.existsSync(NodePath.join(root, forced.entryPointRelativePath)));
  }).pipe(
    Effect.provide(makeContextRefreshIntegrationTestLayer("t3work-context-refresh-rebuild-")),
  ),
);
