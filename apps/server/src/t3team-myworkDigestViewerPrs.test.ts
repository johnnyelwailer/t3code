import { assert, it } from "@effect/vitest";

import { viewerPrsForProject } from "./t3team-myworkDigestViewerPrs.ts";

// Shapes from a live `gh search prs` on nexplore.ghe.com, 2026-10-06.
const pr = (repository: string, number: number, title: string, extra: object = {}) => ({
  host: "nexplore.ghe.com",
  repository,
  number,
  title,
  headBranch: "",
  state: "open",
  isDraft: false,
  updatedAt: "2026-10-06T10:00:00Z",
  viewerReviewRequested: false,
  ...extra,
});

it("keeps the viewer's PRs that name this project's key, a colleague's ticket included", () => {
  const review = pr("hive/ies-koordination", 850, "IES-20767 Documents Testdaten Seeding", {
    viewerReviewRequested: true,
  });
  const colleague = pr("hive/ies-koordination", 833, "IES-18235 schnittstellen fix", {
    viewerReviewRequested: true,
  });
  const otherProject = pr("pj/nexi-distribution", 616, "chore: drop screenshot leftovers", {
    viewerAuthored: true,
  });
  const result = viewerPrsForProject({
    viewerEntries: [review, colleague, otherProject],
    projectEntries: [],
    ticketDisplayIds: ["IES-20767", "IES-23704"],
  });
  assert.deepStrictEqual(
    result.map((entry) => entry.number),
    [850, 833],
  );
});

it("keeps the repository listing's row for a PR it already has, marked as the viewer's own", () => {
  const listed = pr("hive/ies-alarm", 12, "IES-23704 koordination", { headBranch: "IES-23704" });
  const searched = pr("hive/ies-alarm", 12, "IES-23704 koordination", { viewerAuthored: true });
  const result = viewerPrsForProject({
    viewerEntries: [searched],
    projectEntries: [listed],
    ticketDisplayIds: ["IES-23704"],
  });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0]?.headBranch, "IES-23704");
  assert.strictEqual(result[0]?.viewerAuthored, true);
});
