import { matchRecipes } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import {
  getT3TeamProfile,
  resolveEnabledSkillPackIds,
  toRecipeProfileContext,
} from "./profiles.js";
import { listBundledT3TeamRecipes } from "./recipes.js";

const QUICK_START_LIMIT = 5;

/** The side panel's Quick Starts for a fresh ticket of `jiraIssueType`, under the default profile. */
function sidePanelQuickStartIds(jiraIssueType: string): ReadonlyArray<string> {
  const profile = getT3TeamProfile(undefined);
  return matchRecipes(listBundledT3TeamRecipes(), {
    activeProject: { source: { provider: "atlassian" } },
    selectedResource: null,
    resourceKind: "ticket",
    availableIntegrations: ["atlassian"],
    surface: "workitem.detail.sidepanel",
    jiraIssueType,
    enabledSkillPacks: resolveEnabledSkillPackIds({ profile }),
    profile: toRecipeProfileContext(profile),
    availableContextKeys: [
      "ticket.summary",
      "project.summary",
      "ticket.context.pre-implementation",
    ],
  })
    .filter((match) => match.missingContext.length === 0)
    .filter((match) => match.recipe.id !== "manage-project-recipes")
    .slice(0, QUICK_START_LIMIT)
    .map((match) => match.recipe.id);
}

describe("work-item delivery recipes", () => {
  it("offers Fix this bug, and not Implement this, on a Bug", () => {
    const ids = sidePanelQuickStartIds("Bug");
    expect(ids).toContain("fix-this-bug");
    expect(ids).not.toContain("implement-this");
  });

  it.each(["Story", "Task"])("offers Implement this, and not Fix this bug, on a %s", (type) => {
    const ids = sidePanelQuickStartIds(type);
    expect(ids).toContain("implement-this");
    expect(ids).not.toContain("fix-this-bug");
  });

  it("offers neither on an Epic", () => {
    const ids = sidePanelQuickStartIds("Epic");
    expect(ids).not.toContain("fix-this-bug");
    expect(ids).not.toContain("implement-this");
  });
});
