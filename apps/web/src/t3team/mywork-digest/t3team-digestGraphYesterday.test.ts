import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import type { MyWorkDigestPayload } from "~/t3team/backend/t3team-myworkDigestBackendApi";
import { payloadToDigestGraph } from "./t3team-digestGraphMappers";

const project = {
  id: "p1",
  title: "IES NG",
  source: { provider: "atlassian", accountId: "acct", externalProjectId: "IES", raw: {} },
} as unknown as ProjectShellProject;
const entries = [
  {
    account: { id: "acct", provider: "atlassian" },
    externalProjectId: "IES",
    appProjectId: "p1",
  },
];
const viewer = { name: "Philip", role: "", lastVisitAt: "2026-10-05T00:00:00.000Z" };
const ticket = (id: string, key: string) => ({
  id,
  displayId: key,
  title: `Title ${key}`,
  provider: "atlassian",
  kind: "issue",
  url: `https://jira/${key}`,
  projectId: "IES",
  status: "In Review",
  assignee: "Philip",
  updatedAt: "2026-10-05T08:00:00.000Z",
});

function payload(yesterday: MyWorkDigestPayload["projects"][number]["yesterday"]) {
  return {
    scope: "project",
    projects: [
      {
        project: { id: "IES", name: "IES NG" },
        tickets: [ticket("issue-1", "IES-1"), ticket("issue-2", "IES-2")],
        claims: [],
        decisions: [],
        changeRequests: [],
        transitions: [],
        ...(yesterday !== undefined ? { yesterday } : {}),
      },
    ],
  } as unknown as MyWorkDigestPayload;
}

describe("the graph's yesterday", () => {
  it("joins merged PRs and moved tickets onto the ids the rows use, newest first", () => {
    const graph = payloadToDigestGraph({
      payload: payload({
        from: "2026-10-04T22:00:00.000Z",
        until: "2026-10-05T22:00:00.000Z",
        merged: [
          {
            id: "github.com:hive/ies-alarm#7",
            host: "github.com",
            repo: "hive/ies-alarm",
            number: 7,
            title: "IES-1 fix",
            mergedAt: "2026-10-05T09:00:00.000Z",
            workItemKey: "IES-1",
          },
          {
            id: "github.com:hive/ies-alarm#8",
            host: "github.com",
            repo: "hive/ies-alarm",
            number: 8,
            title: "IES-9 not held",
            mergedAt: "2026-10-05T11:00:00.000Z",
            workItemKey: "IES-9",
          },
        ],
        moved: [
          {
            ticketRef: { issueKey: "IES-2" },
            from: "To Do",
            to: "In Review",
            at: "2026-10-05T10:00:00.000Z",
          },
          { ticketRef: { issueKey: "IES-404" }, at: "2026-10-05T12:00:00.000Z" },
        ],
      }),
      projects: [project],
      entries,
      viewer,
    });
    const idOf = (key: string) => graph.tickets.find((t) => t.ref.displayId === key)?.id;
    expect(graph.yesterday?.merged.map((pr) => [pr.number, pr.ticketId, pr.projectId])).toEqual([
      [8, undefined, "p1"],
      [7, idOf("IES-1"), "p1"],
    ]);
    // A move of a ticket the digest does not hold is dropped, not guessed at.
    expect(graph.yesterday?.moved).toEqual([
      { ticketId: idOf("IES-2"), from: "To Do", to: "In Review", at: "2026-10-05T10:00:00.000Z" },
    ]);
  });

  it("leaves yesterday off the graph when no project had anything", () => {
    const graph = payloadToDigestGraph({
      payload: payload(undefined),
      projects: [project],
      entries,
      viewer,
    });
    expect(graph.yesterday).toBeUndefined();
  });
});
