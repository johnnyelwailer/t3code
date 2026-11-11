import { describe, expect, it } from "vite-plus/test";

import { threadRootFileCandidates } from "./t3team-threadRootFileCandidates.ts";

describe("threadRootFileCandidates", () => {
  const roots = ["/repo/app", "/repo/app/.t3team/child-session-worktrees/fix", "/repo/linked-lib"];

  it("joins the reference onto every root except the ordinary cwd", () => {
    expect(threadRootFileCandidates("src/index.ts", { roots, cwd: "/repo/app" })).toEqual([
      "/repo/app/.t3team/child-session-worktrees/fix/src/index.ts",
      "/repo/linked-lib/src/index.ts",
    ]);
  });

  it("tries the emitting agent's root first and never twice", () => {
    expect(
      threadRootFileCandidates("./src/index.ts", {
        roots,
        cwd: "/repo/app/",
        emittingRoot: "/repo/linked-lib/",
      }),
    ).toEqual([
      "/repo/linked-lib/src/index.ts",
      "/repo/app/.t3team/child-session-worktrees/fix/src/index.ts",
    ]);
  });

  it("joins Windows roots with backslashes and compares them case-insensitively", () => {
    expect(
      threadRootFileCandidates("src/a.ts", {
        roots: ["C:\\Work\\App", "D:\\wt\\child", "c:/work/app"],
        cwd: "c:\\work\\app",
      }),
    ).toEqual(["D:\\wt\\child\\src\\a.ts"]);
  });

  it("declines absolute, home, parent and empty references", () => {
    for (const reference of [
      "/etc/passwd",
      "~/notes.md",
      "../outside.ts",
      "src/../x.ts",
      "",
      "  ",
    ]) {
      expect(threadRootFileCandidates(reference, { roots })).toEqual([]);
    }
  });

  it("skips blank and relative roots, and gives old threads with no roots nothing", () => {
    expect(threadRootFileCandidates("src/a.ts", { roots: [" ", "relative/root"] })).toEqual([]);
    expect(threadRootFileCandidates("src/a.ts", { roots: [] })).toEqual([]);
  });

  it("keeps a bare file name: the caller verifies each candidate before use", () => {
    expect(threadRootFileCandidates("README.md", { roots: ["/repo/linked-lib"] })).toEqual([
      "/repo/linked-lib/README.md",
    ]);
  });
});
