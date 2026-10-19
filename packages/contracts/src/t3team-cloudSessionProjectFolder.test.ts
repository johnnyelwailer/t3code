import { describe, expect, it } from "vite-plus/test";

import { plainProjectFolderName } from "./t3team-cloudSessionProjectFolder.ts";

/** The session workflow's `project_name` rule (session.yml, "Resolve the session"). */
const WORKFLOW_RULE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

describe("plainProjectFolderName", () => {
  it("is the readable title plus a suffix that is the same every session", () => {
    expect(plainProjectFolderName("IES NG", "project-1")).toBe("IES NG-781a8188");
    expect(plainProjectFolderName("IES NG", "project-1")).toBe(
      plainProjectFolderName("IES NG", "project-1"),
    );
  });

  it("keeps projects apart whose titles clean up to the same folder", () => {
    const names = [
      plainProjectFolderName("IES/NG", "a"),
      plainProjectFolderName("IES:NG", "b"),
      plainProjectFolderName("x".repeat(80), "c"),
      plainProjectFolderName(`${"x".repeat(80)}y`, "d"),
      plainProjectFolderName("IES NG", "e"),
      plainProjectFolderName("IES NG", "f"),
    ];
    expect(new Set(names).size).toBe(names.length);
  });

  it("always passes the workflow's rule", () => {
    for (const title of [
      "IES NG",
      "",
      "../../etc",
      ".hidden",
      "Ünïcödé ✨",
      "x".repeat(200),
      "a..",
    ]) {
      const name = plainProjectFolderName(title, "0b9c1e7a-1234-4c4c-9c9c-123456789abc");
      expect(name).toMatch(WORKFLOW_RULE);
      expect(name).not.toContain("..");
    }
  });
});
