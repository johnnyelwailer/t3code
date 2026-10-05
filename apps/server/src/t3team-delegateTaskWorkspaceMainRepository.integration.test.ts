/**
 * delegate_task worktree isolation in a project whose main repository is a selected linked clone
 * (the workspace IS that checkout) and whose manifest does not name it yet. With
 * `NEXI_FF_MAIN_REPOSITORY` on — including when the env is unset — omitting `workspace.repository`
 * isolates in a worktree of the main repository; with the flag explicitly off the
 * "pass workspace.repository" error stays, except for adopted monorepos, which predate the flag.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { ProjectMainRepository } from "@t3tools/contracts";
import { afterAll, afterEach, describe, expect, it } from "vite-plus/test";

import { MAIN_REPOSITORY_FLAG_ENV } from "./t3team-mainRepositoryFlag.ts";
import {
  commonDir,
  fails,
  initRepo,
  manifestPath,
  ok,
  writeManifest,
} from "./t3team-delegateTaskWorkspaceTestUtils.ts";

const MAIN_URL = "https://github.com/eval-owner/main-checkout";
const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-delegate-main-"));
const mainCheckout = NodePath.join(root, "main-checkout");
const linkedRepo = NodePath.join(root, "linked-repo");
const selected: ProjectMainRepository = {
  url: MAIN_URL,
  checkoutPath: mainCheckout,
  projectRoot: NodePath.join(root, "project-workspace"),
  selection: "user",
};

initRepo(mainCheckout);
initRepo(linkedRepo);
afterAll(() => NodeFS.rmSync(root, { recursive: true, force: true }));

/** Migrated from the project home: lists the clones, names no main repository unless given. */
const writeMainManifest = (main?: Record<string, unknown>) =>
  writeManifest(mainCheckout, {
    ...main,
    linkedRepositories: [
      { url: MAIN_URL, localPath: mainCheckout, status: "cloned" },
      { url: "https://github.com/eval-owner/eval-repo", localPath: linkedRepo, status: "cloned" },
    ],
  });
const mainEntry = { mainRepository: { localPath: mainCheckout, url: MAIN_URL, status: "user" } };
const mainGitDir = () => NodePath.join(NodeFS.realpathSync(mainCheckout), ".git");

describe("resolveDelegatedWorkspace with a selected main repository", () => {
  afterEach(() => {
    delete process.env[MAIN_REPOSITORY_FLAG_ENV];
  });

  it("defaults to a worktree of the main repository when the flag is on", async () => {
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "1";
    writeMainManifest();
    const resolved = await ok({
      workspaceRoot: mainCheckout,
      projectMainRepository: selected,
      key: "on",
    });
    expect(resolved.repository).toBe(MAIN_URL);
    expect(resolved.worktreePath.startsWith(mainCheckout)).toBe(true);
    expect(commonDir(resolved.worktreePath)).toBe(mainGitDir());
  });

  it("keeps the explicit repository requirement when the flag is explicitly off", async () => {
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "0";
    writeMainManifest();
    expect(
      await fails({ workspaceRoot: mainCheckout, projectMainRepository: selected, key: "off" }),
    ).toContain("pass workspace.repository");
  });

  it("disables a switched manifest default when the flag is explicitly off", async () => {
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "false";
    writeMainManifest(mainEntry);
    expect(await fails({ workspaceRoot: mainCheckout, key: "off-manifest" })).toContain(
      "pass workspace.repository",
    );
  });

  it("uses the switched main repository when the flag env is absent", async () => {
    writeMainManifest(mainEntry);
    const resolved = await ok({ workspaceRoot: mainCheckout, key: "unset" });
    expect(resolved.repository).toBe(MAIN_URL);
    expect(resolved.worktreePath.startsWith(mainCheckout)).toBe(true);
  });

  it("accepts a URL-less selected record before the manifest names it", async () => {
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "1";
    writeMainManifest();
    const resolved = await ok({
      workspaceRoot: mainCheckout,
      projectMainRepository: { checkoutPath: mainCheckout, selection: "user" },
      key: "url-less",
    });
    expect(resolved.repository).toBeNull();
    expect(resolved.worktreePath).toContain(mainCheckout);
  });

  it("normalizes an old adopted manifest on disk and preserves flag-off isolation", async () => {
    process.env[MAIN_REPOSITORY_FLAG_ENV] = "off";
    writeMainManifest({
      metaRepository: { localPath: mainCheckout, url: MAIN_URL, status: "adopted" },
    });
    const resolved = await ok({ workspaceRoot: mainCheckout, key: "adopted" });
    expect(commonDir(resolved.worktreePath)).toBe(mainGitDir());
    const manifest = JSON.parse(NodeFS.readFileSync(manifestPath(mainCheckout), "utf8"));
    expect(manifest.metaRepository).toBeUndefined();
    expect(manifest.mainRepository).toEqual({
      localPath: mainCheckout,
      url: MAIN_URL,
      status: "adopted",
    });
  });
});
