import { describe, expect, it } from "vite-plus/test";

import { definePrompt, defineRecipe, isPromptRef, type WorkflowRef } from "./t3team-sdk.index.ts";

const workflowAction = {
  kind: "workflow",
  path: "./pr.workflow.ts",
  absolutePath: "/abs/pr.workflow.ts",
} as WorkflowRef<unknown, unknown>;

describe("definePrompt", () => {
  it("accepts the string shorthand as a recipe-relative path", () => {
    const prompt = definePrompt("./prompt.md");
    expect(prompt.kind).toBe("prompt");
    expect(prompt.path).toBe("./prompt.md");
    expect(prompt.text).toBeUndefined();
    expect(Object.isFrozen(prompt)).toBe(true);
  });

  it("accepts inline text", () => {
    const prompt = definePrompt({ text: "  Summarize the selected work.  " });
    expect(prompt.text).toBe("Summarize the selected work.");
    expect(prompt.path).toBeUndefined();
  });

  it("rejects a prompt with neither path nor text", () => {
    expect(() => definePrompt({})).toThrow(/requires a non-empty/);
    expect(() => definePrompt("   ")).toThrow(/requires a non-empty/);
  });

  it("rejects supplying both path and text", () => {
    expect(() => definePrompt({ path: "./prompt.md", text: "inline" })).toThrow(/not both/);
  });

  // An absolute or bare path would resolve outside the recipe directory, which is exactly what
  // the server-side containment check exists to prevent — fail at authoring time instead.
  it("rejects a non-relative path", () => {
    expect(() => definePrompt("/etc/passwd")).toThrow(/recipe-relative/);
    expect(() => definePrompt("prompt.md")).toThrow(/recipe-relative/);
  });

  it("narrows with isPromptRef", () => {
    expect(isPromptRef(definePrompt("./prompt.md"))).toBe(true);
    expect(isPromptRef(workflowAction)).toBe(false);
    expect(isPromptRef(null)).toBe(false);
    expect(isPromptRef({ kind: "recipe" })).toBe(false);
  });
});

describe("defineRecipe with prompt actions", () => {
  it("accepts a prompt as the default action", () => {
    const recipe = defineRecipe({
      id: "define-prompt-default",
      version: "0.1.0",
      title: "Explain selected work",
      shortDescription: "Explain the selected item in plain language.",
      surfaces: ["workitem.detail.sidepanel"],
      defaultAction: definePrompt("./prompt.md"),
    });
    expect(isPromptRef(recipe.defaultAction)).toBe(true);
  });

  it("accepts prompt and workflow actions side by side", () => {
    const recipe = defineRecipe({
      id: "define-prompt-mixed",
      version: "0.1.0",
      title: "Mixed",
      shortDescription: "A workflow default with a prompt sibling.",
      surfaces: ["workitem.detail.sidepanel"],
      defaultAction: workflowAction,
      actions: { explain: definePrompt("./explain.md") },
    });
    expect(isPromptRef(recipe.actions?.explain)).toBe(true);
  });

  it("still rejects an action that is neither a workflow nor a prompt", () => {
    expect(() =>
      defineRecipe({
        id: "define-prompt-invalid-action",
        version: "0.1.0",
        title: "Invalid",
        shortDescription: "Bad action entry.",
        surfaces: ["workitem.detail.sidepanel"],
        defaultAction: workflowAction,
        actions: { broken: { kind: "script" } as never },
      }),
    ).toThrow(/defineWorkflow\(\.\.\.\) or definePrompt\(\.\.\.\)/);
  });
});
