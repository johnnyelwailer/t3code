import { describe, expect, it } from "vite-plus/test";

import {
  cloudSessionDeleteConfirmation,
  cloudSessionDeletedTitle,
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
});
