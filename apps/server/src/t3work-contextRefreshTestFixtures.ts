// @effect-diagnostics nodeBuiltinImport:off - shared context refresh test fixtures use temp files.
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ProjectShellProject, ProjectShellProjectId } from "@t3tools/project-context";
import {
  T3WORK_WORK_ITEMS_INDEX_PATH,
  buildJiraTicketEntryPoint,
} from "@t3tools/project-context/t3workContextPaths";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Layer from "effect/Layer";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import { afterEach } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import { SqlitePersistenceMemory } from "./persistence/Layers/Sqlite.ts";
import { replaceAtlassianAuths } from "./t3work-atlassian-auth-store.ts";
import { writeCachedT3workAtlassianBacklog } from "./t3work-atlassian-backlog-cache.ts";
import {
  replaceT3workContextRefreshJobQueue,
  replaceT3workContextRefreshJobSeen,
  upsertT3workContextRefreshJob,
} from "./t3work-context-refresh-jobs.ts";
import { ensureT3workContextCacheTables } from "./t3work-context-cache-tables.ts";
import { t3workContextBackgroundOpportunisticMaxDepth } from "./t3work-contextRefreshBackgroundQueue.ts";
import { T3workContextRefreshServiceLive } from "./t3work-contextRefreshService.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

const tempRoots: string[] = [];

export function registerContextRefreshTestCleanup(): void {
  afterEach(() => {
    replaceAtlassianAuths([]);
    for (const root of tempRoots.splice(0)) {
      NodeFS.rmSync(root, { recursive: true, force: true });
    }
  });
}

export function writeContextRefreshTestJson(
  root: string,
  relativePath: string,
  value: unknown,
): void {
  const absolutePath = NodePath.join(root, relativePath);
  NodeFS.mkdirSync(NodePath.dirname(absolutePath), { recursive: true });
  NodeFS.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function makeContextRefreshTestWorkspace(
  input: {
    readonly prefix?: string;
    readonly projectId?: string;
  } = {},
): { readonly root: string; readonly project: ProjectShellProject } {
  const prefix = input.prefix ?? "t3work-context-refresh-";
  const projectId = input.projectId ?? "project-1";
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), prefix));
  tempRoots.push(root);
  const project: ProjectShellProject = {
    id: projectId as ProjectShellProjectId,
    title: "Project One",
    source: {
      provider: "atlassian",
      accountId: "mock-atlassian",
      externalProjectId: "jira-proj-checkout",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  writeContextRefreshTestJson(root, ".t3work/context/metadata.json", { project });
  writeContextRefreshTestJson(root, T3WORK_WORK_ITEMS_INDEX_PATH, {
    workItems: [
      {
        key: "ac-91",
        ticketEntryPointRelativePath: buildJiraTicketEntryPoint(project.id, "ac-91"),
      },
    ],
  });
  return { root, project };
}

export function makeContextRefreshScopeTestLayer() {
  const nodeLayer = NodeServices.layer;
  return Layer.mergeAll(nodeLayer, WorkspacePaths.layer.pipe(Layer.provide(nodeLayer)));
}

export function makeContextRefreshServiceTestLayer(prefix: string) {
  const nodeLayer = NodeServices.layer;
  return T3workContextRefreshServiceLive.pipe(
    Layer.provide(
      Layer.mergeAll(
        nodeLayer,
        SqlitePersistenceMemory,
        WorkspacePaths.layer.pipe(Layer.provide(nodeLayer)),
        ServerConfig.layerTest(process.cwd(), { prefix }).pipe(Layer.provide(nodeLayer)),
      ),
    ),
  );
}

export function makeContextRefreshIntegrationTestLayer(prefix: string) {
  return Layer.mergeAll(makeContextRefreshServiceTestLayer(prefix), SqlitePersistenceMemory);
}

export function makeContextRefreshLiveLayer(prefix = "t3work-broker-context-refresh-") {
  return makeContextRefreshServiceTestLayer(prefix);
}

export function seedContextRefreshBacklogChild(input: {
  readonly project: ProjectShellProject;
  readonly parentKey: string;
  readonly childKey: string;
  readonly childDisplayId: string;
}) {
  const externalProjectId = input.project.source.externalProjectId!;
  return writeCachedT3workAtlassianBacklog({
    provider: "atlassian",
    accountId: input.project.source.accountId!,
    externalProjectId,
    requestSelection: {},
    response: {
      page: {
        items: [
          {
            provider: "atlassian",
            kind: "issue",
            id: input.parentKey.toLowerCase(),
            displayId: input.parentKey,
            title: "Parent ticket",
            projectId: externalProjectId,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            provider: "atlassian",
            kind: "issue",
            id: input.childKey.toLowerCase(),
            displayId: input.childDisplayId,
            title: "Child ticket",
            parentId: input.parentKey.toLowerCase(),
            projectId: externalProjectId,
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        totalCount: 2,
      },
      capabilities: { canCreateSubtasks: true },
      boards: [],
      sprints: [],
      savedFilters: [],
    },
  });
}

export function seedContextRefreshIncompleteJob(input: {
  readonly workspaceRoot: string;
  readonly rootKey: string;
  readonly jobId: string;
  readonly queue: ReadonlyArray<{ readonly resourceKey: string; readonly depth: number }>;
}) {
  return Effect.gen(function* () {
    yield* ensureT3workContextCacheTables();
    const now = yield* Clock.currentTimeMillis;
    yield* upsertT3workContextRefreshJob({
      jobId: input.jobId,
      rootKey: input.rootKey,
      workspaceRoot: input.workspaceRoot,
      status: "pending",
      maxDepth: t3workContextBackgroundOpportunisticMaxDepth,
      currentDepth: 1,
    });
    yield* replaceT3workContextRefreshJobQueue({
      jobId: input.jobId,
      queue: input.queue.map((item) => ({
        resourceKey: item.resourceKey,
        depth: item.depth,
        enqueuedAt: now,
      })),
    });
    yield* replaceT3workContextRefreshJobSeen({
      jobId: input.jobId,
      seen: [input.rootKey],
    });
  });
}
