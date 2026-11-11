import { describe, expect, it } from "vite-plus/test";

import {
  findThreadRootFileMatch,
  threadRootFileCandidates,
} from "./t3team-threadRootFileCandidates.ts";

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

describe("findThreadRootFileMatch", () => {
  const statFrom = (files: ReadonlyArray<string>) => {
    const calls: string[][] = [];
    const stat = async (paths: ReadonlyArray<string>) => {
      calls.push([...paths]);
      return paths.map((path) => (files.includes(path) ? ("file" as const) : null));
    };
    return { stat, calls };
  };

  it("finds the file in a child worktree when the cwd-joined file is missing", async () => {
    const { stat } = statFrom(["/wt/child/src/a.ts"]);
    expect(
      await findThreadRootFileMatch({
        relativePath: "src/a.ts",
        roots: ["/repo", "/wt/child"],
        cwd: "/repo",
        stat,
      }),
    ).toBe("/wt/child/src/a.ts");
  });

  it("keeps the ordinary target when the cwd-joined file exists", async () => {
    const { stat } = statFrom(["/repo/src/a.ts", "/wt/child/src/a.ts"]);
    expect(
      await findThreadRootFileMatch({
        relativePath: "src/a.ts",
        roots: ["/wt/child"],
        cwd: "/repo",
        stat,
      }),
    ).toBeNull();
  });

  it("prefers the emitting agent's root when several roots have the file", async () => {
    const { stat } = statFrom(["/wt/a/x.md", "/wt/b/x.md"]);
    expect(
      await findThreadRootFileMatch({
        relativePath: "x.md",
        roots: ["/wt/a", "/wt/b"],
        cwd: "/repo",
        emittingRoot: "/wt/b",
        stat,
      }),
    ).toBe("/wt/b/x.md");
  });

  it("never stats for an old thread with no extra roots, and survives a failed stat", async () => {
    const { stat, calls } = statFrom([]);
    expect(
      await findThreadRootFileMatch({ relativePath: "a.ts", roots: ["/repo"], cwd: "/repo", stat }),
    ).toBeNull();
    expect(calls).toEqual([]);
    expect(
      await findThreadRootFileMatch({
        relativePath: "a.ts",
        roots: ["/wt/x"],
        cwd: "/repo",
        stat: async () => null,
      }),
    ).toBeNull();
  });

  it("ignores a directory with the same name", async () => {
    const stat = async (paths: ReadonlyArray<string>) => paths.map(() => "directory" as const);
    expect(
      await findThreadRootFileMatch({ relativePath: "src", roots: ["/wt/x"], cwd: "/repo", stat }),
    ).toBeNull();
  });
});
