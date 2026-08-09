import { describe, expect, it } from "vite-plus/test";

import {
  getProjectRecipeToolGroupForToolId,
  isProjectRecipeToolGroupId,
  normalizeProjectRecipeToolGroups,
  PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP,
  PROJECT_RECIPE_SANDBOX_EXECUTE_TOOL_GROUP,
  PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID,
  PROJECT_RECIPE_TOOL_GROUPS_BY_ID,
} from "./toolGroups.ts";

describe("toolGroups", () => {
  it("every tool id maps to a group that is actually registered", () => {
    // The map and the registry are two separate literals — nothing stops one from naming a group
    // id the other doesn't declare. This is the regression test for that drift, covering every
    // entry rather than just the one this change adds.
    for (const [toolId, groupId] of Object.entries(PROJECT_RECIPE_TOOL_GROUP_BY_TOOL_ID)) {
      expect(
        groupId in PROJECT_RECIPE_TOOL_GROUPS_BY_ID,
        `'${toolId}' points at unregistered group '${groupId}'`,
      ).toBe(true);
    }
  });

  it("registers 'sandbox.execute' as its own tool group", () => {
    expect(isProjectRecipeToolGroupId("sandbox.execute")).toBe(true);
    expect(PROJECT_RECIPE_TOOL_GROUPS_BY_ID["sandbox.execute" as never]).toEqual({
      id: PROJECT_RECIPE_SANDBOX_EXECUTE_TOOL_GROUP.id,
      toolClass: "execute",
      description: PROJECT_RECIPE_SANDBOX_EXECUTE_TOOL_GROUP.description,
      readOnly: false,
    });
  });

  it("classifies 't3team.sandbox.run' under 'sandbox.execute'", () => {
    expect(getProjectRecipeToolGroupForToolId("t3team.sandbox.run")).toBe(
      PROJECT_RECIPE_SANDBOX_EXECUTE_TOOL_GROUP.id,
    );
  });

  it("normalizes a recipe's allowedToolGroups to include 'sandbox.execute' when declared", () => {
    expect(normalizeProjectRecipeToolGroups(["sandbox.execute", "not-a-real-group"])).toEqual([
      "sandbox.execute",
    ]);
  });

  // A review draft is a DRAFT: it sits next to `issue_comment.draft_create` in the same group,
  // rather than in an execute/write group, because nothing reaches GitHub until the user approves
  // the exact payload. Pinned here so a future edit cannot quietly reclassify it upward.
  it("classifies 't3team.github.review.draft_create' as a draft, alongside the issue-comment draft", () => {
    expect(getProjectRecipeToolGroupForToolId("t3team.github.review.draft_create")).toBe(
      PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
    );
    expect(getProjectRecipeToolGroupForToolId("t3team.github.issue_comment.draft_create")).toBe(
      PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
    );
  });
});
