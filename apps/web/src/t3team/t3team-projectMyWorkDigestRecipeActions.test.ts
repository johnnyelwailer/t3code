import type { ProjectShellProject } from "@t3tools/project-context";
import { describe, expect, it } from "vite-plus/test";

import { availableDigestItemActions } from "~/t3team/t3team-ProjectMyWorkDigestActions";
import type { DigestRecipeCatalog } from "~/t3team/t3team-digestRecipeCatalog";
import {
  buildDigestRecipeCatalogInput,
  buildDigestRecipeLaunchCustomization,
  scopeDigestRecipeQuickStart,
} from "~/t3team/t3team-digestRecipeLaunch";
import { digestItemActions, digestReviewActions } from "~/t3team/t3team-projectMyWorkDigestFacts";
import type { DigestGraph, DigestReviewRequest } from "~/t3team/t3team-projectMyWorkDigestPlan";
import { areT3TeamRecipeQuickStartLaunchCustomizationsEqual } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

const project: ProjectShellProject = {
  id: "project-1" as ProjectShellProject["id"],
  title: "Hive",
  source: { provider: "atlassian", externalProjectId: "HIVE", raw: {} },
  workspace: { rootPath: "/tmp/hive", createdAt: "2026-10-01T00:00:00.000Z" },
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function graphWith(state: string, extra: Record<string, unknown> = {}): DigestGraph {
  return {
    blockers: [],
    decisions: [],
    claims: [],
    tickets: [{ id: "t1", projectId: "project-1", ref: { displayId: "HIVE-7", title: "Login" } }],
    changeRequests: [
      {
        id: "pr-9",
        ticketId: "t1",
        host: "ghe.example.com",
        repo: "hive/app",
        number: 9,
        title: "Fix login",
        state,
        reviewers: [],
        updatedAt: "2026-10-01T00:00:00.000Z",
        ...extra,
      },
    ],
  } as unknown as DigestGraph;
}

const review: DigestReviewRequest = {
  id: "r1",
  projectId: "project-1",
  host: "ghe.example.com",
  repo: "hive/api",
  number: 12,
  title: "Add audit log",
  updatedAt: "2026-10-01T00:00:00.000Z",
  workItemKey: "HIVE-3",
};

function quickStart(id: string): T3TeamSidecarRecipeQuickStart {
  return {
    id,
    title: id,
    description: id,
    prompt: `Run ${id}`,
    workflow: {
      kind: "recipe",
      recipeId: id,
      title: id,
      description: id,
      source: "pack",
      surface: "github.pull_request.detail.sidepanel",
    },
  };
}

function catalogOf(...ids: string[]): DigestRecipeCatalog {
  return {
    projectId: "project-1",
    catalogInput: buildDigestRecipeCatalogInput({ project, profileId: undefined }),
    recipes: new Map(ids.map((id) => [id, quickStart(id)])),
  };
}

describe("digest recipe actions", () => {
  it("offers the pack's comment recipe first on a changes-requested PR, scoped to it", () => {
    const [primary, second] = digestItemActions(graphWith("changes-requested"), "t1", 0);
    expect(primary).toEqual({
      label: "Handle comments",
      recipe: "pr-handle-comments",
      scope: {
        projectId: "project-1",
        changeRequest: { host: "ghe.example.com", repo: "hive/app", number: 9, title: "Fix login" },
        workItem: { key: "HIVE-7", title: "Login" },
      },
    });
    expect(second?.href).toBe("https://ghe.example.com/hive/app/pull/9");
  });

  it("keeps the CI link primary and adds the fix-checks recipe on a failing PR", () => {
    const actions = digestItemActions(graphWith("ci-failing"), "t1", 0);
    expect(actions.map((action) => action.recipe ?? action.href)).toEqual([
      "https://ghe.example.com/hive/app/pull/9",
      "pr-fix-ci",
    ]);
  });

  it("gives a review request a single PR-scoped review recipe", () => {
    expect(digestReviewActions(review)).toEqual([
      {
        label: "Review with agent",
        recipe: "pr-review",
        scope: {
          projectId: "project-1",
          changeRequest: {
            host: "ghe.example.com",
            repo: "hive/api",
            number: 12,
            title: "Add audit log",
          },
          workItem: { key: "HIVE-3" },
        },
      },
    ]);
    // No project means nothing to launch against: no action at all.
    expect(digestReviewActions({ ...review, projectId: "" })).toEqual([]);
  });
});

describe("availableDigestItemActions", () => {
  const actions = digestItemActions(graphWith("changes-requested"), "t1", 0);

  it("drops a recipe pill whose recipe is not in the catalog, keeping the links", () => {
    expect(availableDigestItemActions(actions, catalogOf("pr-review")).map((a) => a.label)).toEqual(
      ["Open PR"],
    );
    expect(
      availableDigestItemActions(actions, catalogOf("pr-handle-comments")).map((a) => a.label),
    ).toEqual(["Handle comments", "Open PR"]);
  });

  it("shows no recipe pill without a catalog or for another project's PR", () => {
    expect(availableDigestItemActions(actions, null).map((a) => a.label)).toEqual(["Open PR"]);
    const elsewhere = { ...catalogOf("pr-handle-comments"), projectId: "project-2" };
    expect(availableDigestItemActions(actions, elsewhere).map((a) => a.label)).toEqual(["Open PR"]);
  });

  it("never offers a recipe that has no PR scope (the unshipped nudge)", () => {
    const nudge = [{ label: "Nudge", recipe: "nudge-agent-thread" }];
    expect(availableDigestItemActions(nudge, catalogOf("nudge-agent-thread"))).toEqual([]);
  });
});

describe("scopeDigestRecipeQuickStart", () => {
  const reviewScope = digestReviewActions(review)[0]!.scope!;

  it("rebuilds the launch context with the PR as the active linked resource and its ticket", () => {
    const scoped = scopeDigestRecipeQuickStart({
      quickStart: quickStart("pr-review"),
      catalogInput: buildDigestRecipeCatalogInput({ project, profileId: undefined }),
      scope: reviewScope,
    });
    const launchContext = scoped.workflow?.launchContext;
    expect(launchContext?.surface).toBe("github.pull_request.detail.sidepanel");
    expect(launchContext?.workitem).toMatchObject({ displayId: "HIVE-3", kind: "ticket" });
    const pullRequests = launchContext?.linkedResources.items.filter(
      (resource) => resource.kind === "github.pull-request",
    );
    expect(pullRequests).toEqual([
      expect.objectContaining({
        label: "hive/api#12",
        url: "https://ghe.example.com/hive/api/pull/12",
        raw: { repository: "hive/api", number: 12, host: "ghe.example.com", active: true },
      }),
    ]);
  });

  it("names the PR in launch selections that tell two PRs' stagings apart", () => {
    const first = buildDigestRecipeLaunchCustomization(reviewScope);
    expect(first.selections[0]).toMatchObject({
      name: "pullRequest",
      value: "https://ghe.example.com/hive/api/pull/12",
      displayValue: "hive/api#12",
    });
    const other = buildDigestRecipeLaunchCustomization({
      ...reviewScope,
      changeRequest: { ...reviewScope.changeRequest, number: 13 },
    });
    expect(areT3TeamRecipeQuickStartLaunchCustomizationsEqual(first, other)).toBe(false);
  });
});
