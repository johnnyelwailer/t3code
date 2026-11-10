import { describe, expect, it } from "vite-plus/test";

import {
  cloudSessionDeleteConfirmation,
  cloudSessionDeletedTitle,
  cloudSessionSnapshotOnlyConfirmation,
} from "./t3team-cloudSessionDeleteCopy.ts";

describe("cloud session delete copy", () => {
  it("names the earlier sessions whose state goes too, and promises only what was preserved", () => {
    const lines = cloudSessionDeleteConfirmation({
      repository: "acme/api",
      projects: ["api"],
      otherSessions: 2,
    });
    expect(lines).toContain("Machine: acme/api");
    expect(lines).toContain(
      "This also removes the saved state of 2 earlier sessions of this machine.",
    );
    expect(lines.join("\n")).not.toMatch(/Unpushed work is saved/);
    expect(lines.join("\n")).toMatch(/did not save its last state.*nothing is deleted/);
  });

  it("stays truthful without the preview", () => {
    expect(cloudSessionDeleteConfirmation(null).join("\n")).toMatch(/nothing is deleted/);
    expect(cloudSessionDeletedTitle(null)).toBe("Machine deleted.");
    expect(cloudSessionDeletedTitle("wip/nexi-u-pj-9")).toBe(
      "Machine deleted. Its preserved work is on wip/nexi-u-pj-9.",
    );
  });

  it("warns by name about projects that exist only in the snapshot, then asks once more", () => {
    const info = { repository: null, projects: [], snapshotOnlyProjects: ["notes", "IES NG"] };
    expect(cloudSessionDeleteConfirmation(info)).toContain(
      "These projects have no git remote; their only copy is this session's snapshot, and the delete removes it: notes, IES NG.",
    );
    expect(cloudSessionSnapshotOnlyConfirmation(info)).toBe(
      "Delete notes and IES NG for good? They have no git remote and exist nowhere else.",
    );
  });

  it("warns without names when the session never said, and asks no second time without names", () => {
    const unknown = { repository: null, projects: [], snapshotOnlyProjects: null };
    expect(cloudSessionDeleteConfirmation(unknown).join("\n")).toMatch(
      /Projects made in this session without a git remote exist only in its snapshot/,
    );
    expect(cloudSessionSnapshotOnlyConfirmation(unknown)).toBeNull();
    expect(
      cloudSessionSnapshotOnlyConfirmation({
        repository: null,
        projects: [],
        snapshotOnlyProjects: [],
      }),
    ).toBeNull();
  });
});
