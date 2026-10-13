// @effect-diagnostics nodeBuiltinImport:off - the harness drives real git against temp repos.
/**
 * Linked repositories sync on demand: a bootstrap only records them; an agent, a user or a
 * delegation asks for one, and only that one is cloned or fetched.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ServerConfig } from "./config.ts";
import type { GitWorkflowService } from "./git/GitWorkflowService.ts";
import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { resolveDelegatedWorkspace } from "./t3team-delegateTaskWorkspace.ts";
import {
  LINKED_REPOSITORIES_CONTEXT_PATH,
  withLinkedRepositoryCheckouts,
} from "./t3team-linkedRepositoryContextFile.ts";
import { syncLinkedRepositoryOnDemand } from "./t3team-linkedRepositoryOnDemand.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { bootstrap, git, makeHarness, makeOrigin } from "./t3team-linkedRepositorySync.fixtures.ts";
import { readLinkedRepositoryStatus } from "./t3team-project-repository-routesStatus.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

const run = <A, E>(
  harness: ReturnType<typeof makeHarness>,
  effect: Effect.Effect<A, E, T3TeamLinkedRepositorySync | FileSystem.FileSystem | Path.Path>,
) => effect.pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));

describe("linked repositories on demand", () => {
  it.live("a bootstrap records linked repositories as not cloned and syncs none of them", () => {
    const harness = makeHarness();
    const urls = ["alpha", "beta"].map((name) => makeOrigin(harness.root, name));
    return run(
      harness,
      Effect.gen(function* () {
        const response = yield* bootstrap(harness.workspaceRoot, urls);
        expect(response.linkedRepositories.map((entry) => entry.status)).toEqual([
          "not-cloned",
          "not-cloned",
        ]);
        expect(response.linkedRepositories.every((entry) => !entry.syncState)).toBe(true);
        expect(harness.counts).toMatchObject({ clone: 0, fetch: 0 });
        for (const entry of response.linkedRepositories) {
          expect(NodeFS.existsSync(entry.localPath)).toBe(false);
        }
      }),
    );
  });

  it.live("a legacy pending entry without a clone reads as not cloned after a bootstrap", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "legacy");
    const referencesRoot = NodePath.join(
      harness.workspaceRoot,
      HIDDEN_T3TEAM_DIR,
      REFERENCES_DIR_NAME,
    );
    NodeFS.mkdirSync(referencesRoot, { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(referencesRoot, MANIFEST_FILE_NAME),
      JSON.stringify({
        linkedRepositories: [
          { url, localPath: NodePath.join(referencesRoot, "01-x"), status: "pending" },
        ],
      }),
    );
    return run(
      harness,
      Effect.gen(function* () {
        const response = yield* bootstrap(harness.workspaceRoot, [url]);
        expect(response.linkedRepositories[0]?.status).toBe("not-cloned");
        expect(harness.counts.clone).toBe(0);
      }),
    );
  });

  it.live("adopts a legacy pending entry whose clone is on disk with one fetch, once", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "landed");
    const manifestPath = NodePath.join(
      harness.workspaceRoot,
      HIDDEN_T3TEAM_DIR,
      REFERENCES_DIR_NAME,
      MANIFEST_FILE_NAME,
    );
    return run(
      harness,
      Effect.gen(function* () {
        const first = yield* bootstrap(harness.workspaceRoot, [url], true);
        const localPath = first.linkedRepositories[0]!.localPath;
        yield* Effect.flatMap(T3TeamLinkedRepositorySync, (sync) => sync.awaitSettled(localPath));
        // As an older version left it: the clone landed, the entry still says `pending`.
        NodeFS.writeFileSync(
          manifestPath,
          JSON.stringify({ linkedRepositories: [{ url, localPath, status: "pending" }] }),
        );
        const fetchesBefore = harness.counts.fetch;
        const adopting = yield* bootstrap(harness.workspaceRoot, [url]);
        expect(adopting.linkedRepositories[0]?.syncState).toBeDefined();
        yield* Effect.flatMap(T3TeamLinkedRepositorySync, (sync) => sync.awaitSettled(localPath));
        const [entry] = (yield* readLinkedRepositoryStatus(harness.workspaceRoot))
          .linkedRepositories;
        expect(entry?.status).toBe("updated");
        yield* bootstrap(harness.workspaceRoot, [url]);
        expect(harness.counts).toMatchObject({ clone: 1, fetch: fetchesBefore + 1 });
      }),
    );
  });

  it.live("keeps a recorded clone at its path when the list reorders, without syncing it", () => {
    const harness = makeHarness();
    const [kept, added] = ["kept", "added"].map((name) => makeOrigin(harness.root, name));
    return run(
      harness,
      Effect.gen(function* () {
        const first = yield* bootstrap(harness.workspaceRoot, [kept!], true);
        const keptPath = first.linkedRepositories[0]!.localPath;
        yield* Effect.flatMap(T3TeamLinkedRepositorySync, (sync) => sync.awaitSettled(keptPath));
        const reordered = yield* bootstrap(harness.workspaceRoot, [added!, kept!]);
        expect(reordered.linkedRepositories[1]).toMatchObject({
          localPath: keptPath,
          status: "cloned",
        });
        expect(reordered.linkedRepositories[1]?.syncState).toBeUndefined();
        expect(harness.counts).toMatchObject({ clone: 1, fetch: 0 });
      }),
    );
  });

  it.live("syncs only the requested repository: clones it, then fetches it next time", () => {
    const harness = makeHarness();
    const [wanted, other] = ["wanted", "other"].map((name) => makeOrigin(harness.root, name));
    return run(
      harness,
      Effect.gen(function* () {
        yield* bootstrap(harness.workspaceRoot, [wanted!, other!]);
        const first = yield* syncLinkedRepositoryOnDemand({
          workspaceRoot: harness.workspaceRoot,
          repository: wanted!,
          wait: true,
        });
        expect(first.view.state).toBe("cloned");
        expect(first.view.syncedAt).toBeDefined();
        expect(NodeFS.existsSync(NodePath.join(first.view.localPath!, "a.txt"))).toBe(true);
        expect(harness.counts).toMatchObject({ clone: 1, fetch: 0 });

        yield* syncLinkedRepositoryOnDemand({
          workspaceRoot: harness.workspaceRoot,
          repository: wanted!,
          wait: true,
        });
        expect(harness.counts).toMatchObject({ clone: 1, fetch: 1 });
        const status = yield* readLinkedRepositoryStatus(harness.workspaceRoot);
        expect(status.linkedRepositories.map((entry) => entry.status)).toEqual([
          "updated",
          "not-cloned",
        ]);
      }),
    );
  });

  it.live("without waiting, returns the queued sync; an unknown repository is refused", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "queued");
    return run(
      harness,
      Effect.gen(function* () {
        yield* harness.holdClones();
        yield* bootstrap(harness.workspaceRoot, [url]);
        const queued = yield* syncLinkedRepositoryOnDemand({
          workspaceRoot: harness.workspaceRoot,
          repository: url,
          wait: false,
        });
        expect(queued.view).toMatchObject({ state: "not-cloned", syncing: expect.any(String) });
        const refused = yield* syncLinkedRepositoryOnDemand({
          workspaceRoot: harness.workspaceRoot,
          repository: "someone/elsewhere",
          wait: true,
        }).pipe(Effect.flip);
        expect(refused.message).toContain(`Linked: ${url}`);
      }),
    );
  });

  it.live("the linked-repositories context file carries each repository's checkout state", () => {
    const harness = makeHarness();
    const [cloned, absent] = ["cloned", "absent"].map((name) => makeOrigin(harness.root, name));
    return run(
      harness,
      Effect.gen(function* () {
        yield* bootstrap(harness.workspaceRoot, [cloned!, absent!]);
        const synced = yield* syncLinkedRepositoryOnDemand({
          workspaceRoot: harness.workspaceRoot,
          repository: cloned!,
          wait: true,
        });
        const other = { relativePath: "other.json", contents: "{}" };
        const [file, untouched] = yield* withLinkedRepositoryCheckouts(harness.workspaceRoot, [
          {
            relativePath: LINKED_REPOSITORIES_CONTEXT_PATH,
            contents: JSON.stringify({ linkedRepositoryUrls: [cloned, absent] }),
          },
          other,
        ]);
        expect(untouched).toBe(other);
        expect(JSON.parse(file!.contents)).toEqual({
          linkedRepositoryUrls: [cloned, absent],
          repositories: [
            {
              url: cloned,
              state: "cloned",
              localPath: synced.view.localPath,
              syncedAt: synced.view.syncedAt,
            },
            { url: absent, state: "not-cloned" },
          ],
          syncTool: "t3_linked_repository_sync",
        });
      }),
    );
  });

  const delegate = (harness: ReturnType<typeof makeHarness>, url: string, withSync: boolean) =>
    Effect.gen(function* () {
      yield* bootstrap(harness.workspaceRoot, [url]);
      const driver = yield* GitVcsDriver.GitVcsDriver;
      const sync = yield* T3TeamLinkedRepositorySync;
      return yield* resolveDelegatedWorkspace({
        services: {
          fileSystem: yield* FileSystem.FileSystem,
          path: yield* Path.Path,
          gitWorkflow: {
            createWorktree: (
              args: Parameters<GitWorkflowService["Service"]["createWorktree"]>[0],
            ) => driver.createWorktree(args),
            localStatus: ({ cwd }: { readonly cwd: string }) =>
              Effect.sync(() => ({
                isRepo: true,
                refName: git(cwd, "branch", "--show-current").stdout.trim(),
              })),
          } as unknown as GitWorkflowService["Service"],
          sourceControlProviders: {
            resolve: () => Effect.succeed({ getDefaultBranch: () => Effect.succeed("main") }),
          } as unknown as SourceControlProviderRegistry["Service"],
          ...(withSync ? { linkedRepositorySync: sync } : {}),
        },
        projectWorkspaceRoot: harness.workspaceRoot,
        repository: url,
        baseRef: undefined,
        branchSeed: "Fix checkout",
        worktreeKey: "0123abcd",
      });
    }).pipe(
      Effect.provide(
        GitVcsDriver.layer.pipe(
          Layer.provideMerge(ServerConfig.layerTest(harness.root, { prefix: "t3-linked-od-" })),
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
      Effect.scoped,
    );

  it.live("delegating into a linked repository that is not cloned clones it first", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "delegated");
    return run(
      harness,
      Effect.gen(function* () {
        const workspace = yield* delegate(harness, url, true);
        expect(harness.counts.clone).toBe(1);
        expect(NodeFS.existsSync(NodePath.join(workspace.worktreePath, "a.txt"))).toBe(true);
      }),
    );
  });

  it.live("without the sync service, delegating into an uncloned repository says why", () => {
    const harness = makeHarness();
    const url = makeOrigin(harness.root, "unsynced");
    return run(
      harness,
      Effect.gen(function* () {
        const error = yield* delegate(harness, url, false).pipe(Effect.flip);
        expect(error).toContain("it is not cloned on this machine");
        expect(harness.counts.clone).toBe(0);
      }),
    );
  });
});
