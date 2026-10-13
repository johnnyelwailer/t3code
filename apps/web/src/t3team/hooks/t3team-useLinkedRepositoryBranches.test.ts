import { describe, expect, it } from "vite-plus/test";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";
import { resolveLinkedBranches } from "./t3team-useLinkedRepositoryBranches";

const A = "https://nexplore.ghe.com/hive/a";
const B = "https://nexplore.ghe.com/hive/b";
const recorded = new Map<string, LinkedRepositorySyncResult>([
  [A, { url: A, localPath: "/a", status: "cloned", branch: "feature/pj" }],
  [B, { url: B, localPath: "/b", status: "cloned" }],
]);

describe("resolveLinkedBranches", () => {
  it("keeps what the server recorded when nothing was chosen, and is unchanged", () => {
    expect(resolveLinkedBranches({ urls: [A, B], choices: {}, recorded })).toEqual({
      branches: { [A]: "feature/pj" },
      changed: false,
    });
  });

  it("applies a choice, and returning to the default branch removes the entry", () => {
    expect(
      resolveLinkedBranches({ urls: [A, B], choices: { [B]: "develop", [A]: null }, recorded }),
    ).toEqual({ branches: { [B]: "develop" }, changed: true });
  });

  it("ignores choices for repositories that are no longer linked", () => {
    expect(resolveLinkedBranches({ urls: [B], choices: { [A]: "x" }, recorded })).toEqual({
      branches: {},
      changed: false,
    });
  });
});
