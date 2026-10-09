import { describe, expect, it } from "@effect/vitest";
import {
  ProjectId,
  type PullRequestListEntry,
  type PullRequestListInput,
  type PullRequestListResult,
} from "@t3tools/contracts";
import { ChangeRequestInputError } from "@t3team/sdk";
import * as Effect from "effect/Effect";

import { PullRequestService } from "./pullRequest/PullRequestService.ts";
import { makeChangeRequestReader } from "./t3team-scriptHostChangeRequests.ts";

const projectId = ProjectId.make("project:hive");

const entry = (
  number: number,
  author: string,
  overrides: Partial<PullRequestListEntry> = {},
): PullRequestListEntry =>
  ({
    provider: "github",
    host: "nexplore.ghe.com",
    projectId,
    projectTitle: "Hive",
    repository: "hive/nx-nexi",
    number,
    title: `PR ${number}`,
    url: `https://nexplore.ghe.com/hive/nx-nexi/pull/${number}`,
    author: { login: author, name: null, avatarUrl: null },
    headBranch: `branch-${number}`,
    baseBranch: "main",
    state: "open",
    isDraft: false,
    mergeability: "mergeable",
    additions: 0,
    deletions: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    viewerReviewRequested: false,
    labels: [{ name: "scope:web", color: null }],
    ...overrides,
  }) as PullRequestListEntry;

const result: PullRequestListResult = {
  viewers: { "nexplore.ghe.com": "PJ" },
  providers: [
    {
      host: "nexplore.ghe.com",
      kind: "github",
      searchesOnHost: true,
      projectCount: 1,
      configured: true,
      detail: null,
    },
    {
      host: "github.com",
      kind: "github",
      searchesOnHost: true,
      projectCount: 1,
      configured: false,
      detail: "gh auth login --hostname github.com",
    },
  ],
  entries: [
    entry(412, "pj"),
    entry(377, "colleague", { viewerReviewRequested: true }),
    entry(300, "someone-else"),
  ],
  errors: [],
  truncated: false,
  nextCursors: {},
};

const listCalls: Array<PullRequestListInput> = [];
const reader = makeChangeRequestReader(
  PullRequestService.of({
    list: (input: PullRequestListInput) => {
      listCalls.push(input);
      return Effect.succeed(result);
    },
  } as unknown as PullRequestService["Service"]),
  projectId,
);

describe("ctx.changeRequests.list", () => {
  it("reads upstream's listing for the run's project only and marks the viewer's involvement", async () => {
    listCalls.length = 0;
    const list = await reader.list({ involvement: "all" });
    // Scoped by project: the service lists the project's own and linked repositories, nothing else.
    expect(listCalls).toEqual([{ state: "open", involvement: "all", projectId }]);
    expect(list.entries.map((row) => [row.number, row.involvement])).toEqual([
      [412, ["authored"]],
      [377, ["reviewing"]],
      [300, []],
    ]);
    expect(list.entries[0]).toMatchObject({
      host: "nexplore.ghe.com",
      repository: "hive/nx-nexi",
      headBranch: "branch-412",
      labels: ["scope:web"],
      author: { login: "pj", name: null },
    });
    expect(list.viewers).toEqual({ "nexplore.ghe.com": "PJ" });
    expect(list.unreadable).toEqual([
      { host: "github.com", detail: "gh auth login --hostname github.com" },
    ]);
  });

  it("passes both involvements and a limit through, and defaults to open", async () => {
    listCalls.length = 0;
    await reader.list({ involvement: "authored", limit: 50 });
    await reader.list({ involvement: "reviewing", state: "all" });
    expect(listCalls).toEqual([
      { state: "open", involvement: "authored", projectId, limit: 50 },
      { state: "all", involvement: "reviewing", projectId },
    ]);
  });

  it("refuses a filter the script got wrong before asking the host", async () => {
    listCalls.length = 0;
    await expect(reader.list({ limit: 0 })).rejects.toBeInstanceOf(ChangeRequestInputError);
    await expect(
      reader.list({ involvement: "everyone" as unknown as "all" }),
    ).rejects.toBeInstanceOf(ChangeRequestInputError);
    expect(listCalls).toEqual([]);
  });
});
