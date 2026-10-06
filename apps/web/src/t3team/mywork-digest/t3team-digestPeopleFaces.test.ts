import { describe, expect, it } from "vite-plus/test";

import type { DigestGraph } from "~/t3team/t3team-projectMyWorkDigestPlan";

import { withSharedFaces } from "./t3team-digestPeopleFaces";

const graph = (overrides: Partial<DigestGraph>): DigestGraph =>
  ({
    scope: "project",
    projects: [],
    viewer: { name: "Pat Viewer", role: "", lastVisitAt: "" },
    tickets: [],
    claims: [],
    decisions: [],
    changeRequests: [],
    transitions: [],
    blockers: [],
    ...overrides,
  }) as DigestGraph;

describe("withSharedFaces", () => {
  it("lends a GitHub face to the Jira person with the same full name, accents aside", () => {
    const result = withSharedFaces(
      graph({
        reviewRequests: [
          {
            id: "r",
            projectId: "p",
            repo: "o/r",
            number: 1,
            title: "t",
            updatedAt: "",
            author: { name: "Zoë  Müller", login: "zm", avatarUrl: "https://gh/zm" },
          },
        ],
        dependencies: [
          {
            ticketId: "A-1",
            relation: "you-wait-on",
            other: { key: "A-2", title: "", status: "", assignee: "Zoe Muller" },
          },
        ],
      }),
    );
    expect(result.dependencies?.[0]?.other.assigneeAvatarUrl).toBe("https://gh/zm");
  });

  it("never matches on a bare login or first name", () => {
    const input = graph({
      reviewRequests: [
        {
          id: "r",
          projectId: "p",
          repo: "o/r",
          number: 1,
          title: "t",
          updatedAt: "",
          author: { name: "bm", login: "bm", avatarUrl: "https://gh/bm" },
        },
      ],
      dependencies: [
        {
          ticketId: "A-1",
          relation: "same-story",
          other: { key: "A-2", title: "", status: "", assignee: "bm" },
        },
      ],
    });
    expect(withSharedFaces(input).dependencies?.[0]?.other.assigneeAvatarUrl).toBeUndefined();
  });

  it("lends no face for a name two GitHub accounts share", () => {
    const review = (login: string) => ({
      id: login,
      projectId: "p",
      repo: "o/r",
      number: 1,
      title: "t",
      updatedAt: "",
      author: { name: "Alex Smith", login, avatarUrl: `https://gh/${login}` },
    });
    const result = withSharedFaces(
      graph({
        reviewRequests: [review("asmith"), review("alex-s")],
        dependencies: [
          {
            ticketId: "A-1",
            relation: "same-story",
            other: { key: "A-2", title: "", status: "", assignee: "Alex Smith" },
          },
        ],
      }),
    );
    expect(result.dependencies?.[0]?.other.assigneeAvatarUrl).toBeUndefined();
  });
});
