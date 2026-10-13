// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ServerConfig } from "./config.ts";
import type { GitWorkflowService } from "./git/GitWorkflowService.ts";
import { SourceControlRepositoryService } from "./sourceControl/SourceControlRepositoryService.ts";
import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { delegatedWorktreeKey, resolveDelegatedWorkspace } from "./t3team-delegateTaskWorkspace.ts";
import { LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV } from "./t3team-lazyLinkedRepositoryFlag.ts";
import {
  ensureLinkedRepositoryCheckout,
  linkedRepositoryEnsureTimedOutMessage,
} from "./t3team-linkedRepositoryOnDemand.ts";
import {
  T3TeamLinkedRepositorySync,
  T3TeamLinkedRepositorySyncLive,
} from "./t3team-linkedRepositorySync.ts";
import { MAIN_REPOSITORY_FLAG_ENV } from "./t3team-mainRepositoryFlag.ts";
import { bootstrapWorkspaceReferences } from "./t3team-project-repository-routesReferences.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import * as Schema from "effect/Schema";
import { resolvePullRequestCheckoutRoot } from "./t3team-pullRequestCheckoutRoot.ts";
import { VcsProcess } from "./vcs/VcsProcess.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

const git = (cwd: string, ...args: string[]) =>
  NodeChildProcess.spawnSync("git", args, { cwd, encoding: "utf8" });

const makeOrigin = (root: string, name: string) => {
  const origin = NodePath.join(root, "origins", name);
  NodeFS.mkdirSync(origin, { recursive: true });
  git(origin, "init", "-q", "-b", "main");
  NodeFS.writeFileSync(NodePath.join(origin, "README.md"), "# origin\n");
  git(origin, "add", ".");
  git(origin, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init");
  return origin;
};

const makeHarness = () => {
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-lazy-hard-"));
  const workspaceRoot = NodePath.join(root, "workspace");
  NodeFS.mkdirSync(workspaceRoot, { recursive: true });
  let cloneGate: Deferred.Deferred<void> | undefined;
  let cloneStarted = false;
  let cloneSource: string | undefined;
  const vcs = Layer.succeed(VcsProcess, {
    run: (input) =>
      Effect.sync(() => {
        const result = git(input.cwd, ...input.args);
        return {
          exitCode: (result.status ?? 1) as never,
          stdout: result.stdout,
          stderr: result.stderr,
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      }),
  });
  const sourceControl = Layer.succeed(SourceControlRepositoryService, {
    cloneRepository: (input: { remoteUrl?: string; destinationPath: string }) =>
      Effect.gen(function* () {
        cloneStarted = true;
        if (cloneGate) yield* Deferred.await(cloneGate);
        git(root, "clone", "-q", cloneSource ?? input.remoteUrl ?? "", input.destinationPath);
        return { cwd: input.destinationPath, remoteUrl: input.remoteUrl ?? "", repository: null };
      }),
    prepareClone: (input: { destinationPath: string; remoteUrl?: string }) =>
      Effect.succeed({
        cwd: input.destinationPath,
        remoteUrl: input.remoteUrl ?? "",
        repository: null,
      }),
  } as never);
  const syncLayer = T3TeamLinkedRepositorySyncLive.pipe(
    Layer.provideMerge(Layer.mergeAll(vcs, sourceControl, NodeServices.layer)),
  );
  const driverLayer = GitVcsDriver.layer.pipe(
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-lazy-hard-" })),
    Layer.provideMerge(NodeServices.layer),
  );
  return {
    root,
    workspaceRoot,
    layer: Layer.mergeAll(syncLayer, driverLayer),
    holdClones: () => Effect.map(Deferred.make<void>(), (gate) => (cloneGate = gate)),
    setCloneSource: (url: string) => {
      cloneSource = url;
    },
    cloneStarted: () => cloneStarted,
    cleanup: () => NodeFS.rmSync(root, { recursive: true, force: true }),
  };
};

const withLazyFlags = <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const previousLazy = process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV];
  const previousMain = process.env[MAIN_REPOSITORY_FLAG_ENV];
  process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV] = "1";
  process.env[MAIN_REPOSITORY_FLAG_ENV] = "0";
  return effect.pipe(
    Effect.ensuring(
      Effect.sync(() => {
        if (previousLazy === undefined)
          delete process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV];
        else process.env[LAZY_LINKED_REPOSITORY_CHECKOUT_FLAG_ENV] = previousLazy;
        if (previousMain === undefined) delete process.env[MAIN_REPOSITORY_FLAG_ENV];
        else process.env[MAIN_REPOSITORY_FLAG_ENV] = previousMain;
      }),
    ),
  );
};

describe("lazy linked repository ensure on hard-requirement paths", () => {
  it.live("delegate worktree prep waits for a pending linked clone", () => {
    const harness = makeHarness();
    const origin = makeOrigin(harness.root, "api");
    return withLazyFlags(
      Effect.gen(function* () {
        const response = yield* bootstrapWorkspaceReferences({
          workspaceRoot: harness.workspaceRoot,
          workspaceRepositoryInitialized: true,
          detectedMainRepository: undefined,
          linkedRepositoryUrls: [origin],
        });
        expect(response.linkedRepositories[0]?.status).toBe("pending");

        const sync = yield* T3TeamLinkedRepositorySync;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const driver = yield* GitVcsDriver.GitVcsDriver;
        const gate = yield* harness.holdClones();
        const fiber = yield* Effect.forkScoped(
          resolveDelegatedWorkspace({
            services: {
              fileSystem,
              path,
              gitWorkflow: {
                createWorktree: (args) => driver.createWorktree(args),
                localStatus: ({ cwd }) => Effect.sync(() => ({ isRepo: true, refName: "main" })),
              } as unknown as GitWorkflowService["Service"],
              sourceControlProviders: {
                resolve: () => Effect.succeed({ getDefaultBranch: () => Effect.succeed("main") }),
              } as unknown as SourceControlProviderRegistry["Service"],
              linkedRepositoryOnDemand: { sync, fileSystem, path },
            },
            projectWorkspaceRoot: harness.workspaceRoot,
            repository: origin,
            branchSeed: "child",
            worktreeKey: delegatedWorktreeKey("thread-1", "req-1"),
          }),
        );
        yield* Effect.sleep("80 millis");
        expect(harness.cloneStarted()).toBe(true);
        yield* Deferred.succeed(gate, undefined);
        const resolved = yield* Fiber.join(fiber);
        expect(resolved.worktreePath).toContain("child-session-worktrees");
      }).pipe(
        Effect.scoped,
        Effect.provide(harness.layer),
        Effect.ensuring(Effect.sync(() => harness.cleanup())),
      ),
    );
  });

  it.live("pull request checkout waits for a pending linked clone", () => {
    const harness = makeHarness();
    const origin = makeOrigin(harness.root, "api");
    const repositoryUrl = "https://github.com/acme/api.git";
    const prUrl = "https://github.com/acme/api/pull/4";
    const localPath = NodePath.join(
      harness.workspaceRoot,
      HIDDEN_T3TEAM_DIR,
      REFERENCES_DIR_NAME,
      "01-github.com-acme-api",
    );
    const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
    harness.setCloneSource(origin);
    return withLazyFlags(
      Effect.gen(function* () {
        const references = NodePath.join(
          harness.workspaceRoot,
          HIDDEN_T3TEAM_DIR,
          REFERENCES_DIR_NAME,
        );
        NodeFS.mkdirSync(references, { recursive: true });
        NodeFS.writeFileSync(
          NodePath.join(references, MANIFEST_FILE_NAME),
          encodeJson({
            linkedRepositories: [{ url: repositoryUrl, localPath, status: "pending" }],
          }),
        );
        const sync = yield* T3TeamLinkedRepositorySync;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const gate = yield* harness.holdClones();
        const fiber = yield* Effect.forkScoped(
          resolvePullRequestCheckoutRoot({
            operation: "test",
            cwd: harness.workspaceRoot,
            reference: prUrl,
            sourceControlProviders: {
              resolveHandle: () => Effect.succeed({ provider: undefined, context: null }),
            } as never,
            linkedRepositoryOnDemand: { sync, fileSystem, path },
          }),
        );
        yield* Effect.sleep("80 millis");
        expect(harness.cloneStarted()).toBe(true);
        yield* Deferred.succeed(gate, undefined);
        expect(yield* Fiber.join(fiber)).toBe(localPath);
      }).pipe(
        Effect.scoped,
        Effect.provide(harness.layer),
        Effect.ensuring(Effect.sync(() => harness.cleanup())),
      ),
    );
  });

  it.live("fails with a distinct timeout when ensure wait is exceeded", () => {
    const harness = makeHarness();
    const origin = makeOrigin(harness.root, "api");
    return withLazyFlags(
      Effect.gen(function* () {
        yield* bootstrapWorkspaceReferences({
          workspaceRoot: harness.workspaceRoot,
          workspaceRepositoryInitialized: true,
          detectedMainRepository: undefined,
          linkedRepositoryUrls: [origin],
        });
        yield* harness.holdClones();
        const message = yield* ensureLinkedRepositoryCheckout({
          workspaceRoot: harness.workspaceRoot,
          repository: origin,
          waitTimeoutMs: 40,
        }).pipe(Effect.flip);
        expect(message).toContain(linkedRepositoryEnsureTimedOutMessage(origin, 40));
      }).pipe(Effect.provide(harness.layer), Effect.ensuring(Effect.sync(() => harness.cleanup()))),
    );
  });
});
