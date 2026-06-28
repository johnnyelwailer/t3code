import { describe, expect, it } from "vite-plus/test";

import {
  evaluateRecipeSignalPredicate,
  isRecipeSignalPredicateSatisfied,
  recipeSignalPredicates,
} from "./recipePredicates.js";

describe("evaluateRecipeSignalPredicate", () => {
  it("treats missing signals as unknown and not satisfied for visibility", () => {
    expect(
      isRecipeSignalPredicateSatisfied(recipeSignalPredicates.workitemHasNoChildren, undefined),
    ).toBe(false);
    expect(isRecipeSignalPredicateSatisfied(recipeSignalPredicates.workitemHasNoChildren, {})).toBe(
      false,
    );
  });

  it("hides when workitem.hasChildren is true", () => {
    expect(
      evaluateRecipeSignalPredicate(recipeSignalPredicates.workitemHasNoChildren, {
        "workitem.hasChildren": true,
      }),
    ).toBe(false);
  });

  it("shows when workitem.hasChildren is false", () => {
    expect(
      evaluateRecipeSignalPredicate(recipeSignalPredicates.workitemHasNoChildren, {
        "workitem.hasChildren": false,
      }),
    ).toBe(true);
  });

  it("supports all/any/not composition", () => {
    const predicate = {
      all: [
        { signal: "workitem.type", eq: "Epic" },
        { signal: "workitem.childCount", eq: 0 },
      ],
    } as const;

    expect(
      evaluateRecipeSignalPredicate(predicate, {
        "workitem.type": "Epic",
        "workitem.childCount": 0,
      }),
    ).toBe(true);
    expect(
      evaluateRecipeSignalPredicate(predicate, {
        "workitem.type": "Story",
        "workitem.childCount": 0,
      }),
    ).toBe(false);
    expect(evaluateRecipeSignalPredicate(predicate, { "workitem.type": "Epic" })).toBe("unknown");

    expect(
      evaluateRecipeSignalPredicate(
        {
          any: [
            { signal: "workitem.status", eq: "Done" },
            { signal: "workitem.status", eq: "Closed" },
          ],
        },
        { "workitem.status": "Closed" },
      ),
    ).toBe(true);

    expect(
      evaluateRecipeSignalPredicate(
        { not: { signal: "workitem.hasChildren", eq: true } },
        { "workitem.hasChildren": true },
      ),
    ).toBe(false);
  });

  it("supports numeric comparisons", () => {
    expect(
      evaluateRecipeSignalPredicate(
        { signal: "workitem.childCount", gte: 1 },
        {
          "workitem.childCount": 2,
        },
      ),
    ).toBe(true);
    expect(
      evaluateRecipeSignalPredicate(
        { signal: "workitem.childCount", lt: 1 },
        {
          "workitem.childCount": 0,
        },
      ),
    ).toBe(true);
  });
});
