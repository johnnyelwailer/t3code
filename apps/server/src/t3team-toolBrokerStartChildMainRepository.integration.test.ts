/**
 * Main-repository scenarios of the `t3team.thread.start_child` isolation eval: a project whose
 * main repository is a selected linked clone (the workspace IS that checkout) and whose manifest
 * does not name it yet. With `NEXI_FF_MAIN_REPOSITORY` on, omitting `repo_full_name` isolates in
 * a worktree of the main repository; with it off the existing "pass repo_full_name" error stays.
 * Reuses the eval harness (and its temp-dir cleanup) of the sibling integration file.
 */
// @effect-diagnostics nodeBuiltinImport:off - temp eval harness uses node git setup helpers.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { ProjectId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { MAIN_REPOSITORY_FLAG_ENV } from "./t3team-mainRepositoryFlag.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
} from "./t3team-project-repository-utils.ts";
import { T3TeamToolBroker } from "./t3team-toolBroker.ts";
import {
  createEvalHarness,
  evalRoot,
  initGitRepo,
  linkedRepoPath,
  type EvalVariant,
} from "./t3team-toolBrokerStartChildExecutionScope.integration.test.ts";

const MAIN_URL = "https://github.com/eval-owner/main-checkout";
const mainCheckoutRoot = NodePath.join(evalRoot, "main-checkout");

const mainVariant: EvalVariant = {
  projectId: ProjectId.make("project-main-eval"),
  parentThreadId: ThreadId.make("parent-thread-main-eval"),
  workspaceRoot: mainCheckoutRoot,
  projectTitle: "Eval Main Repository Project",
  mainRepository: {
    url: MAIN_URL,
    checkoutPath: mainCheckoutRoot,
    projectRoot: NodePath.join(evalRoot, "project-workspace"),
    selection: "user",
  },
};

function initMainCheckout(manifestMain?: Record<string, unknown>) {
  if (!NodeFS.existsSync(mainCheckoutRoot)) initGitRepo(mainCheckoutRoot);
  const manifestDir = NodePath.join(mainCheckoutRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
  NodeFS.mkdirSync(manifestDir, { recursive: true });
  // Migrated from the project home: lists the clones, names no main repository yet.
  NodeFS.writeFileSync(
    NodePath.join(manifestDir, MANIFEST_FILE_NAME),
    JSON.stringify({
      ...(manifestMain ? manifestMain : {}),
      linkedRepositories: [
        { url: MAIN_URL, localPath: mainCheckoutRoot, status: "cloned" },
        {
          url: "https://github.com/eval-owner/eval-repo",
          localPath: linkedRepoPath,
          status: "cloned",
        },
      ],
    }),
  );
}

const startChild = (
  options: { manifestMain?: Record<string, unknown>; urlLess?: boolean } = {},
) => {
  const harness = createEvalHarness(
    options.urlLess
      ? { ...mainVariant, mainRepository: { checkoutPath: mainCheckoutRoot, selection: "user" } }
      : mainVariant,
  );
  initMainCheckout(options.manifestMain);
  return harness.runBroker(
    Effect.gen(function* () {
      const broker = yield* T3TeamToolBroker;
      const binding = yield* broker.bindSession({
        threadId: mainVariant.parentThreadId,
        toolContext: harness.toolContext,
      });
      return yield* binding!.callTool({
        server: "t3team",
        tool: "t3team.thread.start_child",
        arguments: { name: "Main repository work", isolation: "own-worktree" },
      });
    }),
  );
};

describe("t3team.thread.start_child isolation with a selected main repository", () => {
  afterEach(() => {
    delete process.env[MAIN_REPOSITORY_FLAG_ENV];
  });

  it("defaults to a worktree of the main repository when the flag is on", async () => {
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "1";
    const startResult = await startChild();
    expect(startResult.isError).toBeUndefined();
    const structured = startResult.structuredContent as {
      worktree_path: string;
      repo_full_name?: string;
    };
    expect(structured.repo_full_name).toBe(MAIN_URL);
    expect(structured.worktree_path.startsWith(mainCheckoutRoot)).toBe(true);
    const commonDir = NodeChildProcess.spawnSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: structured.worktree_path,
      encoding: "utf8",
    }).stdout.trim();
    expect(commonDir).toBe(NodePath.join(NodeFS.realpathSync(mainCheckoutRoot), ".git"));
  });

  it("keeps the explicit repo_full_name requirement when the flag is off", async () => {
    const startResult = await startChild();
    expect(startResult.isError).toBe(true);
    expect(JSON.stringify(startResult.content)).toContain("pass 'repo_full_name'");
  });
  it("disables a switched manifest default when the flag is absent", async () => {
    delete process.env[MAIN_REPOSITORY_FLAG_ENV];
    const result = await startChild({
      manifestMain: {
        mainRepository: { localPath: mainCheckoutRoot, url: MAIN_URL, status: "user" },
      },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("pass 'repo_full_name'");
  });

  it("accepts a URL-less selected record before the manifest names it", async () => {
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "1";
    const result = await startChild({ urlLess: true });
    expect(result.isError).toBeUndefined();
    expect((result.structuredContent as { worktree_path: string }).worktree_path).toContain(
      mainCheckoutRoot,
    );
  });

  it("normalizes an old adopted manifest on disk and preserves flag-off isolation", async () => {
    delete process.env[MAIN_REPOSITORY_FLAG_ENV];
    const result = await startChild({
      manifestMain: {
        metaRepository: { localPath: mainCheckoutRoot, url: MAIN_URL, status: "adopted" },
      },
    });
    expect(result.isError).toBeUndefined();
    const manifest = JSON.parse(
      NodeFS.readFileSync(
        NodePath.join(mainCheckoutRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME, MANIFEST_FILE_NAME),
        "utf8",
      ),
    );
    expect(manifest.metaRepository).toBeUndefined();
    expect(manifest.mainRepository).toEqual({
      localPath: mainCheckoutRoot,
      url: MAIN_URL,
      status: "adopted",
    });
  });
});
