import { describe, expect, it } from "vite-plus/test";

import type { MyWorkDigestPayload } from "~/t3team/backend/t3team-myworkDigestBackendApi";

import { digestReviewRequests } from "./t3team-digestGraphPrJoins";

type Projects = MyWorkDigestPayload["projects"];
type ChangeRequest = Projects[number]["changeRequests"][number];

const pr = (number: number, overrides: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id: `github.example:acme/widgets#${number}`,
  host: "github.example",
  repo: "acme/widgets",
  number,
  state: "needs-you",
  updatedAt: "2026-01-10T09:00:00.000Z",
  title: `ACME-${number} Widget polish`,
  viewerReviewRequested: true,
  authorLogin: "colleague",
  ...overrides,
});

const projects = (changeRequests: ChangeRequest[]): Projects =>
  [{ changeRequests }] as unknown as Projects;

describe("digestReviewRequests", () => {
  const resolve = () => "";
  const projectIdAt = () => "app-project";

  it("lists an open PR waiting on the viewer", () => {
    const reviews = digestReviewRequests(projects([pr(1)]), resolve, projectIdAt);
    expect(reviews.map((review) => review.number)).toEqual([1]);
  });

  it("leaves out a merged PR the host still lists the viewer on as reviewer", () => {
    const reviews = digestReviewRequests(
      projects([pr(1), pr(2, { state: "merged" })]),
      resolve,
      projectIdAt,
    );
    expect(reviews.map((review) => review.number)).toEqual([1]);
  });

  it("leaves out the viewer's own PRs and PRs nobody asked them to review", () => {
    const reviews = digestReviewRequests(
      projects([pr(3, { viewerAuthored: true }), pr(4, { viewerReviewRequested: false })]),
      resolve,
      projectIdAt,
    );
    expect(reviews).toEqual([]);
  });
});
