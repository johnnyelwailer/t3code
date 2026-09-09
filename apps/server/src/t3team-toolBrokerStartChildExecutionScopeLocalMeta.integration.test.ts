/**
 * Local-workspace and monorepo-as-metarepo scenarios of the
 * `t3team.thread.start_child` isolation integration eval (scenarios D–I,
 * split out of `t3team-toolBrokerStartChildExecutionScope.integration.test.ts`
 * for the additive LOC budget). Reuses that file's temp-dir eval harness;
 * the harness's `afterAll` cleanup runs with the imported module.
 */
// @effect-diagnostics nodeBuiltinImport:off - temp eval harness uses node git setup helpers.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vite-plus/test";

import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import {
  EVAL_REPO_FULL_NAME,
  META_REPO_FULL_NAME,
  createEvalHarness,
  linkedRepoPath,
  linkedVariant,
  localVariant,
  localWorkspaceRoot,
  metaVariant,
  metaWorkspaceRoot,
} from "./t3team-toolBrokerStartChildExecutionScope.integration.test.ts";

describe("t3team.thread.start_child isolation integration eval (local + meta variants)", () => {
  it("scenario D: local workspace isolates in a worktree of the local repository", async () => {
    const harness = createEvalHarness(localVariant);
    const { startResult, childView } = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: localVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        const startResult = yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Fix local checkout",
            isolation: "own-worktree",
            kickoff_prompt: "Fix the checkout bug in this local repository.",
          },
        });
        const structured = startResult.structuredContent as { project_session_id: string };
        const childBinding = yield* broker.bindSession({
          threadId: ThreadId.make(structured.project_session_id),
        });
        const childView = yield* childBinding!.callTool({
          server: "t3team",
          tool: "t3team.view.read",
        });
        return { startResult, childView };
      }),
    );

    const structured = startResult.structuredContent as {
      isolation: string;
      execution_scope: string;
      project_session_id: string;
      worktree_path: string;
      branch: string;
      repo_full_name?: string;
    };
    expect(startResult.isError).toBeUndefined();
    expect(structured.isolation).toBe("own-worktree");
    expect(structured.execution_scope).toBe("repository");
    expect(structured.repo_full_name).toBeUndefined();
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(
      NodeChildProcess.spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
        cwd: structured.worktree_path,
        encoding: "utf8",
      }).stdout.trim(),
    ).toBe("true");
    // The worktree lives inside the local repository and .t3team/ is gitignored.
    expect(structured.worktree_path.startsWith(localWorkspaceRoot)).toBe(true);
    expect(structured.worktree_path).toContain("child-session-worktrees");
    const gitignore = NodeFS.readFileSync(NodePath.join(localWorkspaceRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain(".t3team/");

    const view = childView.structuredContent as {
      thread: {
        executionScope: string;
        workspace: { worktreePath: string; currentWorkspaceRoot: string; branch: string };
      };
    };
    expect(view.thread.executionScope).toBe("repository");
    expect(view.thread.workspace.worktreePath).toBe(structured.worktree_path);
    expect(view.thread.workspace.currentWorkspaceRoot).toBe(structured.worktree_path);
    expect(view.thread.workspace.branch).toBe(structured.branch);
  });

  it("scenario E: repo_full_name in a local workspace fails with a clear error", async () => {
    const harness = createEvalHarness(localVariant);
    const result = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: localVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Wrong repo child",
            isolation: "own-worktree",
            repo_full_name: EVAL_REPO_FULL_NAME,
          },
        });
      }),
    );
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("no linked repositories"),
      }),
    );
  });

  it("scenario F: the deprecated execution_scope alias still works and notes the deprecation", async () => {
    const harness = createEvalHarness();
    const result = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: linkedVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Legacy planning child",
            execution_scope: "metarepo",
          },
        });
      }),
    );
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual(
      expect.objectContaining({
        ok: true,
        isolation: "shared",
        execution_scope: "metarepo",
        deprecation_note: expect.stringContaining("'isolation'"),
      }),
    );
  });

  it("scenario G: monorepo-as-metarepo project isolates without repo_full_name in a meta-repo worktree", async () => {
    const harness = createEvalHarness(metaVariant);
    const startResult = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: metaVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Monorepo implementation",
            isolation: "own-worktree",
          },
        });
      }),
    );
    expect(startResult.isError).toBeUndefined();
    const structured = startResult.structuredContent as {
      isolation: string;
      worktree_path: string;
      branch: string;
      repo_full_name?: string;
    };
    expect(structured.isolation).toBe("own-worktree");
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(structured.worktree_path.startsWith(metaWorkspaceRoot)).toBe(true);
    expect(structured.worktree_path).toContain("child-session-worktrees");
    // The worktree's main worktree is the meta-repo itself (monorepo work, GHE #42).
    const worktreeCommonDir = NodeChildProcess.spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: structured.worktree_path,
      encoding: "utf8",
    }).stdout.trim();
    expect(worktreeCommonDir).toBe(NodePath.join(NodeFS.realpathSync(metaWorkspaceRoot), ".git"));
    // The meta-repo keeps only machine-local subpaths ignored, so committed team state under
    // .t3team/ survives the worktree.
    const gitignore = NodeFS.readFileSync(NodePath.join(metaWorkspaceRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain(".t3team/references/");
    expect(gitignore).toContain(".t3team/child-session-worktrees/");
    expect(
      gitignore
        .split(/\r?\n/)
        .map((line) => line.trim())
        .includes(".t3team/"),
    ).toBe(false);
  });

  it("scenario H: repo_full_name matching the meta-repo URL isolates in the meta-repo", async () => {
    const harness = createEvalHarness(metaVariant);
    const startResult = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: metaVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Monorepo explicit repo",
            isolation: "own-worktree",
            repo_full_name: META_REPO_FULL_NAME,
          },
        });
      }),
    );
    expect(startResult.isError).toBeUndefined();
    const structured = startResult.structuredContent as {
      isolation: string;
      worktree_path: string;
      repo_full_name?: string;
    };
    expect(structured.isolation).toBe("own-worktree");
    expect(structured.repo_full_name).toBe(`https://github.com/${META_REPO_FULL_NAME}`);
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(structured.worktree_path.startsWith(metaWorkspaceRoot)).toBe(true);
  });

  it("scenario I: a linked repo in a monorepo project still isolates in that linked repo", async () => {
    const harness = createEvalHarness(metaVariant);
    const startResult = await harness.runBroker(
      Effect.gen(function* () {
        const broker = yield* T3TeamToolBroker;
        const binding = yield* broker.bindSession({
          threadId: metaVariant.parentThreadId,
          toolContext: harness.toolContext,
        });
        return yield* binding!.callTool({
          server: "t3team",
          tool: "t3team.thread.start_child",
          arguments: {
            name: "Linked repo implementation",
            isolation: "own-worktree",
            repo_full_name: EVAL_REPO_FULL_NAME,
          },
        });
      }),
    );
    expect(startResult.isError).toBeUndefined();
    const structured = startResult.structuredContent as {
      isolation: string;
      worktree_path: string;
      repo_full_name?: string;
    };
    expect(structured.isolation).toBe("own-worktree");
    expect(structured.repo_full_name).toBe(EVAL_REPO_FULL_NAME);
    expect(NodeFS.existsSync(structured.worktree_path)).toBe(true);
    expect(structured.worktree_path.startsWith(metaWorkspaceRoot)).toBe(true);
    // The worktree's main worktree is the LINKED repository, not the meta-repo.
    const worktreeCommonDir = NodeChildProcess.spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: structured.worktree_path,
      encoding: "utf8",
    }).stdout.trim();
    expect(worktreeCommonDir).toBe(NodePath.join(NodeFS.realpathSync(linkedRepoPath), ".git"));
  });
});
