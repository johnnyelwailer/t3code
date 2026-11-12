import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import * as ServerConfig from "../config.ts";
import * as RuntimeLayer from "../orchestration-v2/runtimeLayer.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";
import * as ProjectEnrichmentService from "./ProjectEnrichmentService.ts";
import * as ProjectFaviconResolver from "./ProjectFaviconResolver.ts";
import * as ProjectService from "./ProjectService.ts";
import * as RepositoryIdentityResolver from "./RepositoryIdentityResolver.ts";

const layerMetadata = Layer.merge(
  Layer.succeed(RepositoryIdentityResolver.RepositoryIdentityResolver, {
    resolve: (workspaceRoot) =>
      Effect.succeed({
        canonicalKey: `example.test${workspaceRoot}`,
        locator: {
          source: "git-remote" as const,
          remoteName: "origin",
          remoteUrl: `https://example.test${workspaceRoot}.git`,
        },
        rootPath: workspaceRoot,
      }),
  }),
  Layer.succeed(ProjectFaviconResolver.ProjectFaviconResolver, {
    invalidate: () => Effect.void,
    resolvePath: () => Effect.succeed(null),
  }),
);

const layerTest = RuntimeLayer.layerProjectService.pipe(
  Layer.provideMerge(ProjectEnrichmentService.layer),
  Layer.provideMerge(
    Layer.succeed(WorkspacePaths.WorkspacePaths, {
      normalizeWorkspaceRoot: (workspaceRoot) => Effect.succeed(workspaceRoot),
      resolveRelativePathWithinRoot: ({ workspaceRoot, relativePath }) =>
        Effect.succeed({ absolutePath: `${workspaceRoot}/${relativePath}`, relativePath }),
    }),
  ),
  Layer.provideMerge(layerMetadata),
  Layer.provideMerge(SqlitePersistence.layerMemory),
  Layer.provideMerge(ServerSettings.layerTest()),
  Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "project-identity-test-" })),
  Layer.provide(NodeServices.layer),
);

it.effect("getById waits for the repository identity when asked, as listPage does", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const service = yield* ProjectService.ProjectService;
    yield* sql`INSERT INTO projection_projects ${sql.insert({
      project_id: "read:0",
      title: "Read",
      workspace_root: "/work/read-0",
      scripts_json: "[]",
      created_at: "2026-10-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
      deleted_at: null,
      auto_pull: 0,
    })}`;
    const resolved = yield* service.getById(ProjectId.make("read:0"), {
      resolveRepositoryIdentity: true,
    });
    assert.equal(
      Option.getOrThrow(resolved).repositoryIdentity?.canonicalKey,
      "example.test/work/read-0",
    );
    const listed = yield* service.listPage({ cursor: 0, limit: 1 });
    assert.deepEqual(
      listed.projects.map((project) => project.repositoryIdentity?.canonicalKey),
      ["example.test/work/read-0"],
    );
  }).pipe(Effect.scoped, Effect.provide(layerTest)),
);
