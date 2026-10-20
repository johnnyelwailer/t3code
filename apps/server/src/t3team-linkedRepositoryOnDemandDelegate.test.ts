// @effect-diagnostics nodeBuiltinImport:off - the harness drives real git against temp repos.
/**
 * delegate_task into a linked repository that is not cloned: it is cloned on demand first, through
 * the same sync service as everything else.
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
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { bootstrap, git, makeHarness, makeOrigin } from "./t3team-linkedRepositorySync.fixtures.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

describe("delegating into a linked repository on demand", () => {
  const run = <A, E>(
    harness: ReturnType<typeof makeHarness>,
    effect: Effect.Effect<A, E, Layer.Success<ReturnType<typeof makeHarness>["layer"]>>,
  ) => effect.pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(harness.cleanup)));

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
            remoteExists: () => Effect.succeed(false),
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
