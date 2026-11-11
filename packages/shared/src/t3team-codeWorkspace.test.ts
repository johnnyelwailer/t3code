import { describe, expect, it } from "vite-plus/test";

import {
  CODE_WORKSPACE_EDITOR_IDS,
  codeWorkspaceFileName,
  codeWorkspaceFolders,
  renderCodeWorkspace,
} from "./t3team-codeWorkspace.ts";

describe("codeWorkspaceFolders", () => {
  it("names folders by child or branch, else the folder name, in roots order", () => {
    expect(
      codeWorkspaceFolders([
        { path: "/repo", reason: "primary" },
        {
          path: "/repo/.t3team/child-session-worktrees/a1",
          reason: "running-child",
          label: "Fix CI",
        },
        { path: "D:\\wt\\feat-x", reason: "open-pr" },
      ]),
    ).toEqual([
      { path: "/repo", name: "repo" },
      { path: "/repo/.t3team/child-session-worktrees/a1", name: "Fix CI" },
      { path: "D:\\wt\\feat-x", name: "feat-x" },
    ]);
  });

  it("keeps names unique and folders once", () => {
    expect(
      codeWorkspaceFolders([
        { path: "/a/app", reason: "current" },
        { path: "/b/app", reason: "running-child" },
        { path: "/c/x", reason: "running-child", label: "App" },
        { path: "/a/app/", reason: "dirty" },
      ]).map((folder) => folder.name),
    ).toEqual(["app", "app (2)", "App (3)"]);
  });

  it("shortens very long child names", () => {
    const [folder] = codeWorkspaceFolders([
      { path: "/x", reason: "running-child", label: "y".repeat(200) },
    ]);
    expect(folder!.name.length).toBe(60);
  });
});

describe("renderCodeWorkspace", () => {
  it("writes folders and empty settings as stable JSON", () => {
    const text = renderCodeWorkspace([{ path: "C:\\wt\\a", name: "a" }]);
    expect(JSON.parse(text)).toEqual({ folders: [{ name: "a", path: "C:\\wt\\a" }], settings: {} });
    expect(renderCodeWorkspace([{ path: "C:\\wt\\a", name: "a" }])).toBe(text);
  });
});

describe("codeWorkspaceFileName", () => {
  it("is stable per folder, case-insensitive on Windows, and file-name safe", () => {
    const name = codeWorkspaceFileName("D:\\Hive\\My Repo");
    expect(name).toBe(codeWorkspaceFileName("d:/hive/my repo"));
    expect(name).toMatch(/^my-repo-[0-9a-f]{8}\.code-workspace$/);
    expect(codeWorkspaceFileName("/a/repo")).not.toBe(codeWorkspaceFileName("/b/repo"));
  });
});

describe("CODE_WORKSPACE_EDITOR_IDS", () => {
  it("covers the VS Code family only", () => {
    expect(CODE_WORKSPACE_EDITOR_IDS.has("vscode")).toBe(true);
    expect(CODE_WORKSPACE_EDITOR_IDS.has("zed")).toBe(false);
    expect(CODE_WORKSPACE_EDITOR_IDS.has("file-manager")).toBe(false);
  });
});
