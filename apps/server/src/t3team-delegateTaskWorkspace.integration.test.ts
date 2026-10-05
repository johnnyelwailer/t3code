// @effect-diagnostics nodeBuiltinImport:off - temp eval harness uses node git setup helpers.
/**
 * delegate_task `workspace: { isolation: "worktree" }` against real git
 * repositories: a linked repository, a plain local repository, an adopted
 * meta-repo, the validation errors, and the retry reuse of one worktree.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { it as effectIt } from "@effect/vitest";
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import * as Effect from "effect/Effect";
import { afterAll, describe, expect, it } from "vite-plus/test";

import { releaseDelegatedWorkspace } from "./t3team-delegateTaskWorkspace.ts";
import {
  commonDir,
  fails,
  git,
  initRepo,
  ok,
  writeManifest,
} from "./t3team-delegateTaskWorkspaceTestUtils.ts";

const LINKED = "eval-owner/eval-repo";
const META = "eval-owner/eval-monorepo";
const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-delegate-ws-"));
const linkedRepo = NodePath.join(root, "linked-repo");
const linkedWorkspace = NodePath.join(root, "linked-workspace");
const localWorkspace = NodePath.join(root, "local-workspace");
const metaWorkspace = NodePath.join(root, "meta-workspace");

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
      `${PROJECT_STATE_DIR}/`,
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
    expect([first.created, second.created]).toEqual([true, false]);
  });

  effectIt.effect("releases only the worktree and branch its own request created", () =>
    Effect.gen(function* () {
      const created = yield* Effect.promise(() =>
        ok({ workspaceRoot: localWorkspace, key: "release" }),
      );
      const reused = yield* Effect.promise(() =>
        ok({ workspaceRoot: localWorkspace, key: "release" }),
      );
      const gitWorkflow = {
        removeWorktree: (input: { readonly cwd: string; readonly path: string }) =>
          Effect.sync(() => void git(input.cwd, ["worktree", "remove", "--force", input.path])),
        deleteLocalBranch: (input: { readonly cwd: string; readonly refName: string }) =>
          Effect.sync(() => void git(input.cwd, ["branch", "-D", input.refName])),
      };
      const branches = () => git(localWorkspace, ["branch", "--list", created.branch]);

      yield* releaseDelegatedWorkspace(gitWorkflow, reused);
      expect(NodeFS.existsSync(created.worktreePath)).toBe(true);
      expect(branches()).toContain(created.branch);

      yield* releaseDelegatedWorkspace(gitWorkflow, created);
      expect(NodeFS.existsSync(created.worktreePath)).toBe(false);
      expect(branches()).toBe("");
    }),
  );
});
