import { describe, expect, it } from "vite-plus/test";

import { detectComposerTrigger } from "~/composer-logic";
import { applyT3workComposerMenuReplacement } from "~/t3work/composer/t3work-composerMenuApply";
import { resolveT3workComposerMenuSelection } from "~/t3work/composer/t3work-composerMenuSelection";
import {
  isT3workRecipeSlashAlias,
  resolveT3workRecipeSlashAlias,
  resolveT3workRecipeSlashAliases,
} from "~/t3work/composer/t3work-composerRecipeSlashAlias";
import { buildT3workRecipeSlashItems } from "~/t3work/composer/t3work-composerRecipeSlashItems";
import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

function recipe(
  overrides: Partial<T3workSidecarRecipeQuickStart> & { readonly id: string },
): T3workSidecarRecipeQuickStart {
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

describe("resolveT3workRecipeSlashAlias", () => {
  it("accepts the documented alias format only", () => {
    expect(isT3workRecipeSlashAlias("qa-plan")).toBe(true);
    expect(isT3workRecipeSlashAlias("qa2")).toBe(true);
    expect(isT3workRecipeSlashAlias("-qa")).toBe(false);
    expect(isT3workRecipeSlashAlias("QaPlan")).toBe(false);
    expect(isT3workRecipeSlashAlias("qa.plan")).toBe(false);
  });

  it("prefers the declared alias", () => {
    expect(resolveT3workRecipeSlashAlias(qaPlan)).toBe("qa-plan");
  });

  it("defaults to the id when it is a valid alias", () => {
    expect(resolveT3workRecipeSlashAlias(implicit)).toBe("summarize-project-risk");
  });

  it("gives no alias when neither the declared alias nor the id is valid", () => {
    expect(resolveT3workRecipeSlashAlias(recipe({ id: "Weird.Id" }))).toBeNull();
    expect(
      resolveT3workRecipeSlashAlias(recipe({ id: "fine-id", slashAlias: "Not Valid" })),
    ).toBeNull();
  });
});

describe("resolveT3workRecipeSlashAliases", () => {
  it("suppresses aliases that collide with reserved host or provider commands", () => {
    const entries = resolveT3workRecipeSlashAliases({
      recipes: [recipe({ id: "plan" }), qaPlan],
      reservedAliases: ["plan", "default", "commit"],
    });
    expect(entries.map((entry) => entry.alias)).toEqual(["qa-plan"]);
  });

  it("keeps the first recipe when two recipes claim the same alias", () => {
    const entries = resolveT3workRecipeSlashAliases({
      recipes: [qaPlan, recipe({ id: "other-qa", slashAlias: "qa-plan" })],
      reservedAliases: [],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.recipe.id).toBe("create-qa-test-plan");
  });
});

describe("buildT3workRecipeSlashItems", () => {
  it("lists every applicable recipe in catalog order for the empty query", () => {
    const items = buildT3workRecipeSlashItems({
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
    const items = buildT3workRecipeSlashItems({
      recipes: [qaPlan, explain, implicit],
      reservedAliases: [],
      query: "/qa",
    });
    expect(items.map((item) => item.alias)).toEqual(["qa-plan"]);
  });

  it("ranks an alias match ahead of an id-only match", () => {
    const idOnly = recipe({ id: "qa-legacy", slashAlias: "legacy", title: "Legacy" });
    const items = buildT3workRecipeSlashItems({
      recipes: [idOnly, qaPlan],
      reservedAliases: [],
      query: "qa",
    });
    expect(items.map((item) => item.alias)).toEqual(["qa-plan", "legacy"]);
  });

  it("matches on the title when neither alias nor id matches", () => {
    const items = buildT3workRecipeSlashItems({
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
    const [item] = buildT3workRecipeSlashItems({
      recipes: [qaPlan],
      reservedAliases: [],
      query: trigger.query,
    });
    if (!item) throw new Error("expected a recipe item");

    const plan = resolveT3workComposerMenuSelection(item, trigger, text);
    expect(plan?.effect).toEqual({ type: "select-recipe", recipe: qaPlan });
    const next = applyT3workComposerMenuReplacement(text, plan!.replacement);
    expect(next?.text).toBe("");
  });
});
