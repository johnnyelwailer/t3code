import { describe, expect, it } from "vite-plus/test";

import { detectComposerTrigger } from "~/composer-logic";
import { applyT3TeamComposerMenuReplacement } from "~/t3team/composer/t3team-composerMenuApply";
import { resolveT3TeamComposerMenuSelection } from "~/t3team/composer/t3team-composerMenuSelection";
import {
  isT3TeamRecipeSlashAlias,
  resolveT3TeamRecipeSlashAlias,
  resolveT3TeamRecipeSlashAliases,
} from "~/t3team/composer/t3team-composerRecipeSlashAlias";
import { buildT3TeamRecipeSlashItems } from "~/t3team/composer/t3team-composerRecipeSlashItems";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

function recipe(
  overrides: Partial<T3TeamSidecarRecipeQuickStart> & { readonly id: string },
): T3TeamSidecarRecipeQuickStart {
  return {
    title: overrides.id,
    description: "",
    prompt: "",
    ...overrides,
  };
}

const qaPlan = recipe({
  id: "create-qa-test-plan",
  slashAlias: "qa-plan",
  title: "Create QA test plan",
});
const explain = recipe({
  id: "explain-selected-work",
  slashAlias: "explain",
  title: "Explain this simply",
});
const implicit = recipe({ id: "summarize-project-risk", title: "Summarize project risk" });

describe("resolveT3TeamRecipeSlashAlias", () => {
  it("accepts the documented alias format only", () => {
    expect(isT3TeamRecipeSlashAlias("qa-plan")).toBe(true);
    expect(isT3TeamRecipeSlashAlias("qa2")).toBe(true);
    expect(isT3TeamRecipeSlashAlias("-qa")).toBe(false);
    expect(isT3TeamRecipeSlashAlias("QaPlan")).toBe(false);
    expect(isT3TeamRecipeSlashAlias("qa.plan")).toBe(false);
  });

  it("prefers the declared alias", () => {
    expect(resolveT3TeamRecipeSlashAlias(qaPlan)).toBe("qa-plan");
  });

  it("defaults to the id when it is a valid alias", () => {
    expect(resolveT3TeamRecipeSlashAlias(implicit)).toBe("summarize-project-risk");
  });

  it("gives no alias when neither the declared alias nor the id is valid", () => {
    expect(resolveT3TeamRecipeSlashAlias(recipe({ id: "Weird.Id" }))).toBeNull();
    expect(
      resolveT3TeamRecipeSlashAlias(recipe({ id: "fine-id", slashAlias: "Not Valid" })),
    ).toBeNull();
  });
});

describe("resolveT3TeamRecipeSlashAliases", () => {
  it("suppresses aliases that collide with reserved host or provider commands", () => {
    const entries = resolveT3TeamRecipeSlashAliases({
      recipes: [recipe({ id: "plan" }), qaPlan],
      reservedAliases: ["plan", "default", "commit"],
    });
    expect(entries.map((entry) => entry.alias)).toEqual(["qa-plan"]);
  });

  it("keeps the first recipe when two recipes claim the same alias", () => {
    const entries = resolveT3TeamRecipeSlashAliases({
      recipes: [qaPlan, recipe({ id: "other-qa", slashAlias: "qa-plan" })],
      reservedAliases: [],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.recipe.id).toBe("create-qa-test-plan");
  });
});

describe("buildT3TeamRecipeSlashItems", () => {
  it("lists every applicable recipe in catalog order for the empty query", () => {
    const items = buildT3TeamRecipeSlashItems({
      recipes: [qaPlan, explain, implicit],
      reservedAliases: [],
      query: "",
    });
    expect(items.map((item) => item.label)).toEqual([
      "/qa-plan",
      "/explain",
      "/summarize-project-risk",
    ]);
    expect(items[0]).toEqual({
      id: "recipe-slash-command:qa-plan",
      type: "recipe-slash-command",
      alias: "qa-plan",
      recipe: qaPlan,
      label: "/qa-plan",
      description: "Create QA test plan",
    });
  });

  it("narrows on the alias, ignoring the trigger's leading slash", () => {
    const items = buildT3TeamRecipeSlashItems({
      recipes: [qaPlan, explain, implicit],
      reservedAliases: [],
      query: "/qa",
    });
    expect(items.map((item) => item.alias)).toEqual(["qa-plan"]);
  });

  it("ranks an alias match ahead of an id-only match", () => {
    const idOnly = recipe({ id: "qa-legacy", slashAlias: "legacy", title: "Legacy" });
    const items = buildT3TeamRecipeSlashItems({
      recipes: [idOnly, qaPlan],
      reservedAliases: [],
      query: "qa",
    });
    expect(items.map((item) => item.alias)).toEqual(["qa-plan", "legacy"]);
  });

  it("matches on the title when neither alias nor id matches", () => {
    const items = buildT3TeamRecipeSlashItems({
      recipes: [explain],
      reservedAliases: [],
      query: "simply",
    });
    expect(items.map((item) => item.alias)).toEqual(["explain"]);
  });
});

describe("recipe-slash-command selection", () => {
  it("clears the typed alias and stages the recipe instead of editing text", () => {
    const text = "/qa-plan";
    const trigger = detectComposerTrigger(text, text.length);
    if (!trigger) throw new Error("expected a trigger");
    const [item] = buildT3TeamRecipeSlashItems({
      recipes: [qaPlan],
      reservedAliases: [],
      query: trigger.query,
    });
    if (!item) throw new Error("expected a recipe item");

    const plan = resolveT3TeamComposerMenuSelection(item, trigger, text);
    expect(plan?.effect).toEqual({ type: "select-recipe", recipe: qaPlan });
    const next = applyT3TeamComposerMenuReplacement(text, plan!.replacement);
    expect(next?.text).toBe("");
  });
});
