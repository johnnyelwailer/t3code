import { describe, expect, it } from "vite-plus/test";

import {
  digestActionLine,
  digestItemActions,
  digestPrUrl,
  digestReviewerUrl,
} from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

describe("digestPrUrl", () => {
  it("falls back to github.com without a host", () => {
    expect(digestPrUrl({ repo: "hive/app", number: 7 })).toBe("https://github.com/hive/app/pull/7");
  });

  it("links a GitHub Enterprise PR to its own host", () => {
    expect(digestPrUrl({ host: "ghe.example.com", repo: "hive/app", number: 7 })).toBe(
      "https://ghe.example.com/hive/app/pull/7",
    );
  });

  it("tolerates a scheme, trailing slash, or blank host", () => {
    expect(digestPrUrl({ host: "https://ghe.example.com/", repo: "a/b", number: 1 })).toBe(
      "https://ghe.example.com/a/b/pull/1",
    );
    expect(digestPrUrl({ host: "  ", repo: "a/b", number: 1 })).toBe(
      "https://github.com/a/b/pull/1",
    );
  });
});

describe("digestReviewerUrl", () => {
  it("follows the PR's host", () => {
    expect(digestReviewerUrl({ login: "pj" })).toBe("https://github.com/pj");
    expect(digestReviewerUrl({ login: "pj" }, "ghe.example.com")).toBe(
      "https://ghe.example.com/pj",
    );
  });
});

describe("host-aware action links", () => {
  const graph = {
    blockers: [],
    decisions: [],
    claims: [],
    changeRequests: [
      {
        id: "ghe.example.com:hive/app#9",
        ticketId: "t1",
        host: "ghe.example.com",
        repo: "hive/app",
        number: 9,
        state: "needs-you",
        reviewers: [],
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ],
  } as unknown as DigestGraph;

  it("points the action line and the Review button at the GHE PR", () => {
    expect(digestActionLine(graph, "t1")?.pr).toMatchObject({ host: "ghe.example.com", number: 9 });
    expect(digestItemActions(graph, "t1", 0)[0]?.href).toBe(
      "https://ghe.example.com/hive/app/pull/9",
    );
  });
});
