import { listImplementedT3TeamToolCatalogEntries } from "@t3tools/project-context/t3teamToolCatalog";
import { expect, it } from "vite-plus/test";

import {
  getProjectRecipeToolGroupForToolId,
  PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP,
} from "./toolGroups.js";

it("classifies every implemented draft tool in mutation.draft", () => {
  const drafts = listImplementedT3TeamToolCatalogEntries()
    .map((tool) => tool.id)
    .filter((id) => /\.draft_(update|create|remove)$/.test(id));
  expect(drafts.length).toBeGreaterThan(0);
  const unclassified = drafts.filter(
    (id) => getProjectRecipeToolGroupForToolId(id) !== PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  );
  expect(unclassified).toEqual([]);
  expect(getProjectRecipeToolGroupForToolId("t3team.work_item.change_set")).toBe(
    PROJECT_RECIPE_MUTATION_DRAFT_TOOL_GROUP.id,
  );
});
