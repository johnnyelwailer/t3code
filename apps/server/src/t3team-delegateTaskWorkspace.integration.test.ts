// @effect-diagnostics nodeBuiltinImport:off - temp eval harness uses node git setup helpers.
/**
 * delegate_task `workspace: { isolation: "worktree" }` against real git
 * repositories: a linked repository, a plain local repository, an adopted
 * meta-repo, the validation errors, and the retry reuse of one worktree.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { afterAll, describe, expect, it } from "vite-plus/test";

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

const LINKED = "eval-owner/eval-repo";
const META = "eval-owner/eval-monorepo";
const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-delegate-ws-"));
const linkedRepo = NodePath.join(root, "linked-repo");
const linkedWorkspace = NodePath.join(root, "linked-workspace");
const localWorkspace = NodePath.join(root, "local-workspace");
const metaWorkspace = NodePath.join(root, "meta-workspace");

const git = (cwd: string, args: ReadonlyArray<string>) => {
  const result = NodeChildProcess.spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
};
const initRepo = (dir: string) => {
  NodeFS.mkdirSync(dir, { recursive: true });
  git(dir, ["init"]);
  git(dir, ["config", "user.email", "eval@test.com"]);
  git(dir, ["config", "user.name", "Eval"]);
  NodeFS.writeFileSync(NodePath.join(dir, "README.md"), "# eval\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-m", "initial"]);
  git(dir, ["branch", "-M", "main"]);
};
const writeManifest = (workspace: string, manifest: unknown) => {
  const dir = NodePath.join(workspace, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
  NodeFS.mkdirSync(dir, { recursive: true });
  NodeFS.writeFileSync(NodePath.join(dir, MANIFEST_FILE_NAME), JSON.stringify(manifest));
};
const linkedEntry = {
  url: `https://github.com/${LINKED}`,
  localPath: linkedRepo,
  status: "cloned",
};

initRepo(linkedRepo);
NodeFS.mkdirSync(linkedWorkspace, { recursive: true });
writeManifest(linkedWorkspace, { linkedRepositories: [linkedEntry] });
initRepo(localWorkspace);
initRepo(metaWorkspace);
writeManifest(metaWorkspace, {
  metaRepository: {
    url: `https://github.com/${META}`,
    localPath: metaWorkspace,
    status: "adopted",
  },
  linkedRepositories: [linkedEntry],
});
afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

const resolve = (input: {
  readonly workspaceRoot: string;
  readonly repository?: string;
  readonly key?: string;
}) =>
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
      repository: input.repository,
      baseRef: undefined,
      branchSeed: "Fix checkout",
      worktreeKey: delegatedWorktreeKey("thread:parent", input.key ?? NodePath.basename(root)),
    }).pipe(Effect.result);
  }).pipe(
    Effect.provide(GitVcsDriver.layer),
    Effect.provide(ServerConfig.layerTest(process.cwd(), { prefix: "t3-delegate-ws-git-" })),
    Effect.provide(NodeServices.layer),
    Effect.scoped,
    Effect.runPromise,
  );

const ok = async (input: Parameters<typeof resolve>[0]) => {
  const result = await resolve(input);
  if (result._tag !== "Success") throw new Error(`expected success: ${String(result.failure)}`);
  return result.success;
};
const fails = async (input: Parameters<typeof resolve>[0]) => {
  const result = await resolve(input);
  if (result._tag !== "Failure") throw new Error("expected a failure");
  return result.failure;
};
const commonDir = (worktree: string) =>
  NodePath.resolve(worktree, git(worktree, ["rev-parse", "--git-common-dir"]));

describe("resolveDelegatedWorkspace", () => {
  it("creates a worktree of the named linked repository", async () => {
    const resolved = await ok({ workspaceRoot: linkedWorkspace, repository: LINKED, key: "a" });
    expect(resolved.repository).toBe(LINKED);
    expect(resolved.baseRef).toBe("main");
    expect(resolved.worktreePath).toContain("child-session-worktrees");
    expect(commonDir(resolved.worktreePath)).toBe(
      NodePath.join(NodeFS.realpathSync(linkedRepo), ".git"),
    );
    expect(git(resolved.worktreePath, ["branch", "--show-current"])).toBe(resolved.branch);
  });

  it("asks for a repository when the project links several", async () => {
    expect(await fails({ workspaceRoot: linkedWorkspace })).toContain("pass workspace.repository");
  });

  it("isolates a plain local repository and gitignores the worktree area", async () => {
    const resolved = await ok({ workspaceRoot: localWorkspace, key: "b" });
    expect(resolved.repository).toBeNull();
    expect(resolved.worktreePath.startsWith(localWorkspace)).toBe(true);
    expect(NodeFS.readFileSync(NodePath.join(localWorkspace, ".gitignore"), "utf8")).toContain(
      ".t3team/",
    );
  });

  it("rejects a repository in a project that links none", async () => {
    expect(await fails({ workspaceRoot: localWorkspace, repository: LINKED })).toContain(
      "links no repositories",
    );
  });

  it("isolates in the adopted meta-repo by default or when named, and in a linked repo when named", async () => {
    const byDefault = await ok({ workspaceRoot: metaWorkspace, key: "c" });
    expect(byDefault.repository).toBe(`https://github.com/${META}`);
    expect(commonDir(byDefault.worktreePath)).toBe(
      NodePath.join(NodeFS.realpathSync(metaWorkspace), ".git"),
    );
    const named = await ok({ workspaceRoot: metaWorkspace, repository: META, key: "d" });
    expect(commonDir(named.worktreePath)).toBe(
      NodePath.join(NodeFS.realpathSync(metaWorkspace), ".git"),
    );
    const linked = await ok({ workspaceRoot: metaWorkspace, repository: LINKED, key: "e" });
    expect(linked.repository).toBe(LINKED);
    expect(commonDir(linked.worktreePath)).toBe(
      NodePath.join(NodeFS.realpathSync(linkedRepo), ".git"),
    );
  });

  it("reuses the worktree a retried request already created", async () => {
    const first = await ok({ workspaceRoot: localWorkspace, key: "retry" });
    const second = await ok({ workspaceRoot: localWorkspace, key: "retry" });
    expect(second.worktreePath).toBe(first.worktreePath);
    expect(second.branch).toBe(first.branch);
  });
});
