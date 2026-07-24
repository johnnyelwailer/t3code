// @effect-diagnostics nodeBuiltinImport:off - integration test uses real temp files.
// @effect-diagnostics preferSchemaOverJson:off - fixture JSON keeps the test compact.
import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { afterEach } from "vite-plus/test";

import * as ServerConfig from "./config.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

import { clearT3workFixtureProjects } from "./t3work-fixtureProjectRegistry.ts";
import { seedT3workFixtureProject } from "./t3work-fixtureProjectSeed.ts";
import { makeContextRefreshIntegrationTestLayer } from "./t3work-contextRefreshTestFixtures.ts";

const tempRoots: string[] = [];

afterEach(() => {
  clearT3workFixtureProjects();
  for (const root of tempRoots.splice(0)) {
    NodeFS.rmSync(root, { recursive: true, force: true });
  }
});

function writeJson(root: string, relativePath: string, value: unknown): void {
  const absolutePath = NodePath.join(root, relativePath);
  NodeFS.mkdirSync(NodePath.dirname(absolutePath), { recursive: true });
  NodeFS.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeTicket(input: {
  readonly key: string;
  readonly type: string;
  readonly status: string;
  readonly statusSince: string;
  readonly parentId?: string;
  readonly estimateHours?: number;
  readonly timeSpentHours?: number;
  readonly links?: ReadonlyArray<{
    relation: string;
    direction?: "inward" | "outward";
    key: string;
  }>;
  readonly comments?: ReadonlyArray<{ author: string; createdAt: string; body: string }>;
}) {
  return {
    ticket: {
      id: input.key,
      projectId: "fx-project",
      ...(input.parentId ? { parentId: input.parentId } : {}),
      description: `Beschreibung für ${input.key}`,
      ref: {
        provider: "jira",
        kind: "issue",
        id: input.key,
        displayId: input.key,
        title: `Titel ${input.key}`,
        type: input.type,
        url: `https://example.invalid/browse/${input.key}`,
        projectId: "fx-project",
      },
      issueType: input.type,
      status: input.status,
      statusSince: input.statusSince,
      priority: "Medium",
      assignee: "Lena Baumgartner",
      ...(input.estimateHours === undefined ? {} : { estimateHours: input.estimateHours }),
      ...(input.timeSpentHours === undefined ? {} : { timeSpentHours: input.timeSpentHours }),
      ...(input.links ? { links: input.links } : {}),
      comments: input.comments ?? [],
      updatedAt: "2026-07-20T08:00:00.000Z",
    },
  };
}

function makeFixtureDirectory(): string {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3work-fixture-source-"));
  tempRoots.push(root);
  writeJson(root, "metadata.json", {
    project: {
      id: "fx-project",
      title: "Fixture Project",
      source: { provider: "jira", externalProjectId: "fx-project", externalProjectKey: "FX" },
      createdAt: "2026-07-20T08:00:00.000Z",
      updatedAt: "2026-07-20T08:00:00.000Z",
    },
    linkedRepositoryUrls: [],
  });
  writeJson(
    root,
    "work-items/FX-1.json",
    makeTicket({
      key: "FX-1",
      type: "Story",
      status: "In Progress",
      statusSince: "2026-03-12T09:30:00.000Z",
      estimateHours: 2,
      timeSpentHours: 10,
      comments: [{ author: "Nina", createdAt: "2026-07-02T09:00:00.000Z", body: "Offene Frage?" }],
    }),
  );
  writeJson(
    root,
    "work-items/FX-2.json",
    makeTicket({
      key: "FX-2",
      type: "Bug",
      status: "To Do",
      statusSince: "2026-07-15T07:45:00.000Z",
      parentId: "FX-1",
      links: [{ relation: "blocks", direction: "outward", key: "FX-1" }],
    }),
  );
  return root;
}

it.effect("ingests a fixture directory through the live refresh pipeline", () =>
  Effect.gen(function* () {
    const fixtureRoot = makeFixtureDirectory();
    const workspaceRoot = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "t3work-fixture-workspace-"),
    );
    tempRoots.push(workspaceRoot);

    const seeded = yield* seedT3workFixtureProject({ fixtureRoot, workspaceRoot });
    assert.equal(seeded.accountId, "fixture:demo");
    assert.equal(seeded.projectId, "fx-project");
    assert.equal(seeded.workItemCount, 2);
    assert.deepEqual([...seeded.refreshedKeys], ["FX-1", "FX-2"]);
    assert.deepEqual([...seeded.failedKeys], []);

    const sql = yield* SqlClient.SqlClient;
    const resources = yield* sql<{
      resource_key: string;
      snapshot_json: string;
    }>`SELECT resource_key, snapshot_json FROM t3work_context_resources ORDER BY resource_key`;
    assert.deepEqual(
      resources.map((row) => row.resource_key),
      ["FX-1", "FX-2"],
    );

    const byKey = new Map(
      resources.map((row) => [
        row.resource_key,
        JSON.parse(row.snapshot_json) as {
          ref: { type?: string };
          fields: Record<string, unknown>;
        },
      ]),
    );
    // The type-gate that made every type-gated recipe invisible: real Story/Bug types.
    assert.equal(byKey.get("FX-1")!.ref.type, "Story");
    assert.equal(byKey.get("FX-2")!.ref.type, "Bug");
    assert.equal(byKey.get("FX-1")!.fields.type, "Story");
    assert.equal(byKey.get("FX-2")!.fields.type, "Bug");
    assert.equal(byKey.get("FX-1")!.fields.status, "In Progress");
    assert.equal(byKey.get("FX-1")!.fields.statusSince, "2026-03-12T09:30:00.000Z");
    assert.equal(byKey.get("FX-1")!.fields.estimateHours, 2);
    assert.equal(byKey.get("FX-1")!.fields.timeSpentHours, 10);
    assert.lengthOf(byKey.get("FX-1")!.fields.comments as ReadonlyArray<unknown>, 1);

    const edges = yield* sql<{
      source_key: string;
      target_key: string;
      relation: string;
    }>`SELECT source_key, target_key, relation FROM t3work_context_edges ORDER BY source_key, relation`;
    const edgeTriples = edges.map((row) => `${row.source_key}-${row.relation}->${row.target_key}`);
    assert.include(edgeTriples, "FX-1-child->FX-2");
    assert.include(edgeTriples, "FX-2-parent->FX-1");
    assert.include(edgeTriples, "FX-2-reference->FX-1");

    // Full-text projection is populated too, so context search works offline.
    const search = yield* sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM t3work_context_search`;
    assert.isAtLeast(Number(search[0]!.count), 2);

    // The on-disk context the agents read is written by the shared bundle builder.
    const indexPath = NodePath.join(workspaceRoot, ".t3work/context/work-items/index.json");
    assert.isTrue(NodeFS.existsSync(indexPath));
    const index = JSON.parse(NodeFS.readFileSync(indexPath, "utf8")) as {
      workItems: ReadonlyArray<{ key: string }>;
    };
    assert.deepEqual(
      index.workItems.map((item) => item.key),
      ["FX-1", "FX-2"],
    );
    const metadata = JSON.parse(
      NodeFS.readFileSync(NodePath.join(workspaceRoot, ".t3work/context/metadata.json"), "utf8"),
    ) as { project: { source: { provider: string; accountId: string } } };
    assert.equal(metadata.project.source.provider, "atlassian");
    assert.equal(metadata.project.source.accountId, "fixture:demo");
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        makeContextRefreshIntegrationTestLayer("t3work-fixture-project-seed-"),
        NodeServices.layer,
        WorkspacePaths.layer.pipe(Layer.provide(NodeServices.layer)),
        ServerConfig.layerTest(process.cwd(), { prefix: "t3work-fixture-project-seed-" }).pipe(
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  ),
);
