// @effect-diagnostics nodeBuiltinImport:off - temp eval harness uses node git setup helpers.
/**
 * Real-git harness for `resolveDelegatedWorkspace` integration tests: temp repositories, reference
 * manifests, and a resolver wired to the real git driver.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import type { ProjectMainRepository } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { ServerConfig } from "./config.ts";
import type { GitWorkflowService } from "./git/GitWorkflowService.ts";
import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import { delegatedWorktreeKey, resolveDelegatedWorkspace } from "./t3team-delegateTaskWorkspace.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import * as GitVcsDriver from "./vcs/GitVcsDriver.ts";

export const git = (cwd: string, args: ReadonlyArray<string>) => {
  const result = NodeChildProcess.spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
};
export const initRepo = (dir: string) => {
  NodeFS.mkdirSync(dir, { recursive: true });
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "eval@test.com"]);
  git(dir, ["config", "user.name", "Eval"]);
  NodeFS.writeFileSync(NodePath.join(dir, "README.md"), "# eval\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "initial"]);
  git(dir, ["branch", "-M", "main"]);
};
export const manifestPath = (workspace: string) =>
  NodePath.join(workspace, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME, MANIFEST_FILE_NAME);
export const writeManifest = (workspace: string, manifest: unknown) => {
  NodeFS.mkdirSync(NodePath.dirname(manifestPath(workspace)), { recursive: true });
  NodeFS.writeFileSync(manifestPath(workspace), JSON.stringify(manifest));
};
export const commonDir = (worktree: string) =>
  NodePath.resolve(worktree, git(worktree, ["rev-parse", "--git-common-dir"]));

export interface ResolveInput {
  readonly workspaceRoot: string;
  readonly repository?: string;
  readonly key?: string;
  readonly projectMainRepository?: ProjectMainRepository;
}

export const resolve = (input: ResolveInput) =>
  Effect.gen(function* () {
    const driver = yield* GitVcsDriver.GitVcsDriver;
    const services = {
      fileSystem: yield* FileSystem.FileSystem,
      path: yield* Path.Path,
      gitWorkflow: {
        createWorktree: (args: Parameters<GitWorkflowService["Service"]["createWorktree"]>[0]) =>
          driver.createWorktree(args),
        localStatus: ({ cwd }: { readonly cwd: string }) =>
          Effect.sync(() => ({ isRepo: true, refName: git(cwd, ["branch", "--show-current"]) })),
      } as unknown as GitWorkflowService["Service"],
      sourceControlProviders: {
        resolve: () => Effect.succeed({ getDefaultBranch: () => Effect.succeed("main") }),
      } as unknown as SourceControlProviderRegistry["Service"],
    };
    return yield* resolveDelegatedWorkspace({
      services,
      projectWorkspaceRoot: input.workspaceRoot,
      projectMainRepository: input.projectMainRepository,
      repository: input.repository,
      baseRef: undefined,
      branchSeed: "Fix checkout",
      worktreeKey: delegatedWorktreeKey(
        "thread:parent",
        input.key ?? NodePath.basename(input.workspaceRoot),
      ),
    }).pipe(Effect.result);
  }).pipe(
    Effect.provide(
      GitVcsDriver.layer.pipe(
        Layer.provideMerge(
          ServerConfig.layerTest(process.cwd(), { prefix: "t3-delegate-ws-git-" }),
        ),
        Layer.provideMerge(NodeServices.layer),
      ),
    ),
    Effect.scoped,
    Effect.runPromise,
  );

export const ok = async (input: ResolveInput) => {
  const result = await resolve(input);
  if (result._tag !== "Success") throw new Error(`expected success: ${String(result.failure)}`);
  return result.success;
};
export const fails = async (input: ResolveInput) => {
  const result = await resolve(input);
  if (result._tag !== "Failure") throw new Error("expected a failure");
  return result.failure;
};
