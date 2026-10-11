// @effect-diagnostics nodeBuiltinImport:off - builds a real temp workspace with linked repositories.
/**
 * Fixtures for the file-read tests: fake providers behind the provider registry, the REAL
 * `PullRequestService` over them, and the script host built on that service.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert } from "@effect/vitest";
import {
  type OrchestrationProjectShell,
  type ProjectId,
  type SourceControlProviderKind,
} from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts/settings";
import { CHANGE_REQUEST_FILE_MAX_BYTES, CHANGE_REQUEST_FILE_MAX_LINES } from "@t3team/sdk";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { afterAll } from "vite-plus/test";

import * as PullRequestFilesViewed from "./persistence/PullRequestFilesViewed.ts";
import * as SqlitePersistence from "./persistence/Sqlite.ts";
import * as ProjectService from "./project/ProjectService.ts";
import * as RepositoryIdentityResolver from "./project/RepositoryIdentityResolver.ts";
import type { PullRequestProviderApi } from "./pullRequest/PullRequestProvider.ts";
import * as PullRequestProviderRegistry from "./pullRequest/PullRequestProviderRegistry.ts";
import * as PullRequestReadCache from "./pullRequest/PullRequestReadCache.ts";
import * as PullRequestService from "./pullRequest/PullRequestService.ts";
import type { ProviderFileAtRevision } from "./pullRequest/t3team-fileAtRevision.ts";
import * as ServerSettingsService from "./serverSettings.ts";
import * as SourceControlProviderRegistry from "./sourceControl/SourceControlProviderRegistry.ts";
import * as SourceControlRateLimit from "./sourceControl/SourceControlRateLimit.ts";
import { HIDDEN_T3TEAM_DIR } from "./t3team-project-repository-utils.ts";
import * as ScriptHost from "./t3team-scriptHostContext.ts";
import * as Store from "./t3team-v2/t3team-packDocumentStore.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

export const projectId = "project-1" as ProjectId;
export const HEAD = "a".repeat(40);
export const BASE = "b".repeat(40);
export const PINNED = "c".repeat(40);
const bytes = (text: string) => new TextEncoder().encode(text);
const numbered = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`).join("\n") + "\n";

type Files = Record<string, Uint8Array>;
/** `repository -> commit -> path -> bytes`. A path that is not listed is absent at that commit. */
type Repositories = Record<string, Record<string, Files>>;

export const providerCalls: Array<{
  method: string;
  repository: string;
  revision?: string;
  maxBytes?: number;
}> = [];

/** A provider shaped like `kind`'s host: it reports shas on detail and serves files by commit. */
function fakeHost(
  kind: SourceControlProviderKind,
  options: { repositories: Repositories; canReadFiles?: boolean; withoutShas?: string },
): PullRequestProviderApi {
  const readFileAtRevision: PullRequestProviderApi["readFileAtRevision"] = (input) =>
    Effect.sync(() => {
      providerCalls.push({
        method: "readFileAtRevision",
        repository: input.repository,
        revision: input.revision,
        maxBytes: input.maxBytes,
      });
      const content = options.repositories[input.repository]?.[input.revision]?.[input.path];
      if (content === undefined) return null;
      return {
        blobSha: `blob:${input.path}:${content.length}`,
        size: content.length,
        content: content.length > input.maxBytes ? null : content,
      } satisfies ProviderFileAtRevision;
    });
  return {
    kind,
    capabilities: { diff: true },
    getViewer: () => Effect.succeed("viewer"),
    getChangeRequest: (input: { repository: string; number: number }) =>
      Effect.sync(() => {
        providerCalls.push({ method: "detail", repository: input.repository });
        return {
          number: input.number,
          title: "Change",
          url: `https://${kind}.test/${input.repository}/${input.number}`,
          author: null,
          headBranch: "feature",
          baseBranch: "main",
          state: "open",
          isDraft: false,
          mergeability: "mergeable",
          additions: 1,
          deletions: 1,
          createdAt: "2026-10-01T00:00:00Z",
          updatedAt: "2026-10-02T00:00:00Z",
          reviewRequestLogins: [],
          labels: [],
          body: "",
          changedFiles: 1,
          mergedAt: null,
          closedAt: null,
          reviewers: [],
          checks: [],
          ...(input.repository === options.withoutShas ? {} : { headSha: HEAD, baseSha: BASE }),
        };
      }),
    ...(options.canReadFiles === false ? {} : { readFileAtRevision }),
  } as unknown as PullRequestProviderApi;
}

const github: Repositories = {
  "acme/app": {
    [HEAD]: {
      "src/a.ts": bytes("one\ntwo\nthree\nfour\nfive\n"),
      "src/bin.dat": new Uint8Array([1, 2, 0, 3]),
      "src/long.ts": bytes(numbered(CHANGE_REQUEST_FILE_MAX_LINES + 500)),
      "src/huge.ts": new Uint8Array(CHANGE_REQUEST_FILE_MAX_BYTES + 1).fill(97),
      "src/empty.ts": new Uint8Array(),
    },
    [BASE]: { "src/a.ts": bytes("old\n"), "src/deleted.ts": bytes("gone\n") },
    [PINNED]: { "src/a.ts": bytes("pinned\n") },
  },
};
const gitlab: Repositories = {
  "group/proj": {
    [HEAD]: { "lib/b.py": bytes("alpha\nbeta\ngamma\n"), "lib/bin.dat": new Uint8Array([0]) },
    [BASE]: { "lib/b.py": bytes("before\n") },
  },
};

const project = (workspaceRoot: string): OrchestrationProjectShell => ({
  id: projectId,
  title: "app",
  workspaceRoot,
  repositoryIdentity: {
    canonicalKey: "github.com/acme/app",
    locator: {
      source: "git-remote",
      remoteName: "origin",
      remoteUrl: "https://github.com/acme/app.git",
    },
    provider: "github",
    displayName: "acme/app",
  },
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
});

const encodeLinkedRepositories = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ linkedRepositoryUrls: Schema.Array(Schema.String) })),
);
const workspace = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3team-script-files-"));
NodeFS.mkdirSync(NodePath.join(workspace, HIDDEN_T3TEAM_DIR, "context"), { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(workspace, HIDDEN_T3TEAM_DIR, "context", "linked-repositories.json"),
  encodeLinkedRepositories({
    linkedRepositoryUrls: [
      "https://gitlab.com/group/proj.git",
      "https://gitlab.com/group/noshas.git",
      "https://bitbucket.org/acme/legacy.git",
    ],
  }),
);
afterAll(() => NodeFS.rmSync(workspace, { recursive: true, force: true }));

const scriptHost = Effect.gen(function* () {
  const providers = [
    fakeHost("github", { repositories: github }),
    // One GitLab-shaped host; `group/noshas` is the repository whose detail reports no commits.
    fakeHost("gitlab", {
      repositories: { ...gitlab, "group/noshas": {} },
      withoutShas: "group/noshas",
    }),
    fakeHost("bitbucket", { repositories: {}, canReadFiles: false }),
  ];
  const context = yield* Layer.build(
    Layer.mergeAll(
      Layer.mock(ServerSettingsService.ServerSettingsService)({
        getSettings: Effect.succeed(DEFAULT_SERVER_SETTINGS),
      }),
      Layer.succeed(
        PullRequestProviderRegistry.PullRequestProviderRegistry,
        PullRequestProviderRegistry.fromProviders(providers),
      ),
      Layer.mock(SourceControlProviderRegistry.SourceControlProviderRegistry)({
        resolveLink: () => undefined,
        resolveHandle: () => Effect.die("Unexpected provider refinement"),
      }),
      Layer.mock(ProjectService.ProjectService)({
        listShells: () => Effect.succeed([project(workspace)]),
        getShell: () => Effect.succeed(Option.some(project(workspace))),
      }),
      Layer.mock(RepositoryIdentityResolver.RepositoryIdentityResolver)({
        resolve: () => Effect.succeed(null),
      }),
      WorkspacePaths.layer.pipe(Layer.provide(NodeServices.layer)),
      NodeServices.layer,
      SourceControlRateLimit.layer,
      PullRequestFilesViewed.layer.pipe(Layer.provide(SqlitePersistence.layerMemory)),
      Layer.effect(PullRequestReadCache.PullRequestReadCache, PullRequestReadCache.make).pipe(
        Layer.provide(KeyValueStore.layerMemory),
        Layer.provide(NodeServices.layer),
      ),
    ),
  );
  const service = yield* Effect.provideContext(PullRequestService.make, context);
  const host = yield* Layer.build(
    ScriptHost.layer.pipe(
      Layer.provide(Layer.succeed(PullRequestService.PullRequestService, service)),
      Layer.provide(Layer.succeed(Store.T3TeamPackDocumentStore, {} as never)),
      Layer.provide(Layer.succeed(Store.PackDocumentCollections, new Map())),
    ),
  );
  return Context.get(host, ScriptHost.T3TeamScriptHost);
});

export const forRun = (toolGroups: ReadonlyArray<string>) =>
  Effect.map(scriptHost, (host) =>
    host.forRun({ projectId, recipePath: "/repo/.t3team/recipes/local", toolGroups }),
  );
export const reader = () => Effect.map(forRun(["integration.read"]), (ctx) => ctx.changeRequests!);

export const rejects = <E extends Error>(
  attempt: () => Promise<unknown>,
  type: new (...args: never[]) => E,
) =>
  Effect.promise(async () => {
    providerCalls.length = 0;
    const error = await attempt().then(
      () => undefined,
      (caught: unknown) => caught,
    );
    assert.isTrue(error instanceof type, `expected ${type.name}, got ${String(error)}`);
    return error as E;
  });
