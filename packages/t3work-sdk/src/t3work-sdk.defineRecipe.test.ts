import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  defineRecipe,
  defineScript,
  getRegisteredRecipe,
  listRegisteredRecipes,
  type WorkflowRef,
} from "./t3work-sdk.index.ts";

// A typed workflow ref standing in for `defineWorkflow<typeof Module>(...)` without touching disk.
const prReviewAction = {
  kind: "workflow",
  path: "./pr.workflow.ts",
  absolutePath: "/abs/pr.workflow.ts",
} as WorkflowRef<{ prTitle: string }, { summary: string; merged: boolean }>;

describe("defineRecipe", () => {
  it("returns a frozen recipe ref, defaulting scope to project", () => {
    const recipe = defineRecipe({
      id: "define-recipe-basic",
      version: "0.1.0",
      title: "Review a pull request",
      shortDescription: "Summarize a PR, then ask whether to merge.",
      surfaces: ["workitem.detail.sidepanel"],
      icon: "git-pull-request",
      rank: 70,
      appliesTo: { requiresIntegration: ["jira"], jiraIssueTypes: ["Bug", "Story"] },
      allowedToolGroups: ["integration.read"],
      slashAlias: "pr-review",
      defaultAction: prReviewAction,
      defaults: { prTitle: "Untitled" },
    });

    expect(recipe.kind).toBe("recipe");
    expect(recipe.scope).toBe("project");
    expect(recipe.title).toBe("Review a pull request");
    expect(recipe.surfaces).toEqual(["workitem.detail.sidepanel"]);
    expect(recipe.defaultAction).toBe(prReviewAction);
    expect(recipe.defaults).toEqual({ prTitle: "Untitled" });
    expect(Object.isFrozen(recipe)).toBe(true);
  });

  it("registers the recipe and re-registers (upsert, last-wins) without throwing", () => {
    defineRecipe({
      id: "define-recipe-upsert",
      version: "0.1.0",
      title: "First",
      shortDescription: "first",
      surfaces: ["thread.context"],
      defaultAction: prReviewAction,
    });
    expect(getRegisteredRecipe("define-recipe-upsert")?.title).toBe("First");

    // Discovery re-imports recipe.ts on every render-context change, so the same id legitimately
    // re-registers — this must NOT throw (unlike defineTool's duplicate guard).
    const second = defineRecipe({
      id: "define-recipe-upsert",
      version: "0.2.0",
      title: "Second",
      shortDescription: "second",
      surfaces: ["thread.context"],
      defaultAction: prReviewAction,
    });
    expect(getRegisteredRecipe("define-recipe-upsert")).toBe(second);
    expect(getRegisteredRecipe("define-recipe-upsert")?.title).toBe("Second");
    expect(listRegisteredRecipes().some((entry) => entry.id === "define-recipe-upsert")).toBe(true);
  });

  it("rejects empty id, empty version, and non-project scope", () => {
    const base = {
      version: "0.1.0",
      title: "T",
      shortDescription: "d",
      surfaces: ["thread.context"],
      defaultAction: prReviewAction,
    } as const;

    expect(() => defineRecipe({ ...base, id: "  " })).toThrow(/non-empty id/);
    expect(() => defineRecipe({ ...base, id: "ok", version: "" })).toThrow(/non-empty version/);
    expect(() =>
      // @ts-expect-error — only project scope is supported; this also asserts the runtime guard.
      defineRecipe({ ...base, id: "ok2", scope: "personal" }),
    ).toThrow(/project-scoped/);
  });

  it("carries a frozen scripts registration of ScriptRefs (Epic 25 §Scripts)", () => {
    const fetchPr = defineScript({
      inputs: Schema.Struct({ url: Schema.String }),
      outputs: Schema.Struct({ title: Schema.String }),
      handler: async (args) => ({ title: `pr for ${args.url}` }),
    });

    const recipe = defineRecipe({
      id: "define-recipe-scripts",
      version: "0.1.0",
      title: "Scripts",
      shortDescription: "d",
      surfaces: ["thread.context"],
      scripts: { fetchPr },
      defaultAction: prReviewAction,
    });

    expect(recipe.scripts).toBeDefined();
    expect(recipe.scripts!.fetchPr).toBe(fetchPr);
    expect(recipe.scripts!.fetchPr!.kind).toBe("script");
    expect(Object.isFrozen(recipe.scripts)).toBe(true);
  });

  it("carries a frozen actions map alongside defaultAction (Epic 16: one recipe, several actions)", () => {
    const estimateAction = {
      kind: "workflow",
      path: "./estimate.workflow.ts",
      absolutePath: "/abs/estimate.workflow.ts",
    } as WorkflowRef<{ storyKey: string }, { points: number }>;

    const recipe = defineRecipe({
      id: "define-recipe-actions",
      version: "0.1.0",
      title: "Multi-action",
      shortDescription: "d",
      surfaces: ["workitem.detail.sidepanel"],
      defaultAction: prReviewAction,
      actions: { estimate: estimateAction },
    });

    // `defaultAction` is untouched — a plain launch still runs it.
    expect(recipe.defaultAction).toBe(prReviewAction);
    expect(recipe.actions?.estimate).toBe(estimateAction);
    expect(Object.isFrozen(recipe.actions)).toBe(true);
  });

  it("rejects action entries that are not workflows, bad names, and the reserved 'default'", () => {
    const base = {
      version: "0.1.0",
      title: "T",
      shortDescription: "d",
      surfaces: ["thread.context"],
      defaultAction: prReviewAction,
    } as const;

    expect(() =>
      defineRecipe({
        ...base,
        id: "define-recipe-bad-action",
        // @ts-expect-error — a string is not a WorkflowRef; also asserts the runtime guard.
        actions: { estimate: "./estimate.workflow.ts" },
      }),
    ).toThrow(/actions\.estimate is not a defineWorkflow/);

    expect(() =>
      defineRecipe({
        ...base,
        id: "define-recipe-bad-action-name",
        actions: { "not a name": prReviewAction },
      }),
    ).toThrow(/action names must match/);

    expect(() =>
      defineRecipe({
        ...base,
        id: "define-recipe-reserved-action-name",
        actions: { default: prReviewAction },
      }),
    ).toThrow(/reserved for defaultAction/);
  });

  it("accepts ctx-derived metadata and a visible predicate (Epic 16 §Plugin Modules)", () => {
    const recipe = defineRecipe({
      id: "define-recipe-derived",
      version: "0.1.0",
      title: (ctx) => `QA plan for ${ctx.workitem?.displayId ?? "selected work"}`,
      shortDescription: (ctx) => `Depth: ${ctx.profile.technicalDepth}`,
      icon: (ctx) => (ctx.workitem?.type === "Bug" ? "bug" : "clipboard-check"),
      rank: (ctx) => (ctx.workitem?.priority === "High" ? 90 : 50),
      visible: (ctx) => ctx.workitem?.provider === "jira",
      surfaces: ["workitem.detail.sidepanel"],
      defaultAction: prReviewAction,
    });

    // The SDK keeps the derivers as authored; discovery is what evaluates them against a context.
    expect(typeof recipe.title).toBe("function");
    expect(typeof recipe.visible).toBe("function");
  });

  it("rejects scripts entries that are not defineScript(...) results", () => {
    const base = {
      version: "0.1.0",
      title: "T",
      shortDescription: "d",
      surfaces: ["thread.context"],
      defaultAction: prReviewAction,
    } as const;

    expect(() =>
      defineRecipe({
        ...base,
        id: "define-recipe-bad-script",
        // @ts-expect-error — a plain function is not a ScriptRef; also asserts the runtime guard.
        scripts: { broken: async () => ({}) },
      }),
    ).toThrow(/scripts\.broken is not a defineScript/);

    expect(() =>
      defineRecipe({
        ...base,
        id: "define-recipe-empty-script-name",
        scripts: { " ": undefined as never },
      }),
    ).toThrow(/script names must be non-empty/);
  });
});
