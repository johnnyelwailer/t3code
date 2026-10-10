import { describe, expect, it } from "vite-plus/test";

import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

import { digestPrThreadClaims } from "./t3team-useDigestPrThreadClaims";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const pr = {
  id: "pr",
  ticketId: "IES-1",
  host: "ghe.example",
  repo: "hive/app",
  number: 7,
  state: "open",
  reviewers: [],
  updatedAt: "",
};
const graph = { claims: [], changeRequests: [pr] } as unknown as DigestGraph;
const link = { host: "ghe.example", repository: "hive/app", number: 7 };
const shell = (id: string, status: string | null, updatedAt: string, links = [link]) =>
  ({
    id,
    projectId: "proj",
    title: `thread ${id}`,
    providerInstanceId: "nexplore",
    archivedAt: null,
    updatedAt,
    latestRun: status === null ? null : { status },
    pullRequests: links,
  }) as never;

describe("digestPrThreadClaims", () => {
  it("puts a running thread linked to the PR on its ticket as a living dot", () => {
    const [claim] = digestPrThreadClaims(
      graph,
      [shell("a", "running", "2026-10-06T11:59:00Z")],
      NOW,
    );
    expect(claim).toMatchObject({ threadId: "a", ticketId: "IES-1", running: true });
    expect(claim?.threadUrl).toBe("/t3team/projects/proj/threads/a");
  });
  it("keeps a recently finished thread outlined, drops week-old ones and unrelated threads", () => {
    const claims = digestPrThreadClaims(
      graph,
      [
        shell("done", "completed", "2026-10-05T12:00:00Z"),
        shell("old", "completed", "2026-09-20T12:00:00Z"),
        shell("other", "running", "2026-10-06T11:00:00Z", [{ ...link, number: 8 }]),
      ],
      NOW,
    );
    expect(claims.map((claim) => [claim.threadId, claim.finished])).toEqual([["done", true]]);
  });
});
