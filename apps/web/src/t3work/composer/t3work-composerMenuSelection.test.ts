import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";

import { detectComposerTrigger } from "~/composer-logic";
import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import { applyT3workComposerMenuReplacement } from "~/t3work/composer/t3work-composerMenuApply";
import {
  extendT3workReplacementRangeForTrailingSpace,
  resolveT3workComposerMenuSelection,
} from "~/t3work/composer/t3work-composerMenuSelection";

const claudeDriver = ProviderDriverKind.make("claudeAgent");

function planFor(text: string, item: ComposerCommandItem) {
  const trigger = detectComposerTrigger(text, text.length);
  if (!trigger) throw new Error(`expected a trigger for ${JSON.stringify(text)}`);
  return resolveT3workComposerMenuSelection(item, trigger, text);
}

function applied(text: string, item: ComposerCommandItem) {
  const plan = planFor(text, item);
  if (!plan) throw new Error("expected a selection plan");
  const next = applyT3workComposerMenuReplacement(text, plan.replacement);
  if (!next) throw new Error("expected the replacement to apply");
  return { plan, next };
}

describe("extendT3workReplacementRangeForTrailingSpace", () => {
  it("swallows an existing space only when the replacement ends with one", () => {
    expect(extendT3workReplacementRangeForTrailingSpace("/x here", 2, "/commit ")).toBe(3);
    expect(extendT3workReplacementRangeForTrailingSpace("/x here", 2, "/commit")).toBe(2);
    expect(extendT3workReplacementRangeForTrailingSpace("/x", 2, "/commit ")).toBe(2);
  });
});

describe("resolveT3workComposerMenuSelection", () => {
  it("inserts a serialized file link for path items", () => {
    const { next } = applied("look at @mai", {
      id: "path:file:apps/web/src/main.tsx",
      type: "path",
      path: "apps/web/src/main.tsx",
      pathKind: "file",
      label: "main.tsx",
      description: "apps/web/src",
    });
    expect(next.text.startsWith("look at ")).toBe(true);
    expect(next.text).toContain("apps/web/src/main.tsx");
    expect(next.text.endsWith(" ")).toBe(true);
  });

  it("clears the typed range and opens the model picker for /model", () => {
    const { plan, next } = applied("/model", {
      id: "slash:model",
      type: "slash-command",
      command: "model",
      label: "/model",
      description: "Switch response model for this thread",
    });
    expect(plan.effect).toEqual({ type: "open-model-picker" });
    expect(plan.replacement.focusEditorAfterReplace).toBe(false);
    expect(next.text).toBe("");
  });

  it("clears the typed range and reports the built-in command for /plan", () => {
    const { plan, next } = applied("/plan", {
      id: "slash:plan",
      type: "slash-command",
      command: "plan",
      label: "/plan",
      description: "Switch this thread into plan mode",
    });
    expect(plan.effect).toEqual({ type: "built-in-slash-command", command: "plan" });
    expect(plan.replacement.focusEditorAfterReplace).toBe(true);
    expect(next.text).toBe("");
  });

  it("inserts the literal provider command with a single trailing space", () => {
    const { next } = applied("/com", {
      id: "provider-slash-command:claudeAgent:commit",
      type: "provider-slash-command",
      provider: claudeDriver,
      command: { name: "commit" },
      label: "/commit",
      description: "Commit staged changes",
    });
    expect(next.text).toBe("/commit ");
  });

  it("does not double the separator when a space already follows the range", () => {
    const text = "/com rest";
    const trigger = detectComposerTrigger(text, 4);
    if (!trigger) throw new Error("expected a trigger");
    const plan = resolveT3workComposerMenuSelection(
      {
        id: "provider-slash-command:claudeAgent:commit",
        type: "provider-slash-command",
        provider: claudeDriver,
        command: { name: "commit" },
        label: "/commit",
        description: "Commit staged changes",
      },
      trigger,
      text,
    );
    expect(plan?.replacement.rangeEnd).toBe(5);
    const next = applyT3workComposerMenuReplacement(text, plan!.replacement);
    expect(next?.text).toBe("/commit rest");
  });

  it("inserts a $skill chip for skill items", () => {
    const { next } = applied("$rev", {
      id: "skill:claudeAgent:review",
      type: "skill",
      provider: claudeDriver,
      skill: { name: "review", path: "skills/review", enabled: true },
      label: "review",
      description: "Review a diff",
    });
    expect(next.text).toBe("$review ");
  });
});

describe("applyT3workComposerMenuReplacement", () => {
  it("refuses to apply when the editor text moved on", () => {
    const plan = planFor("/com", {
      id: "provider-slash-command:claudeAgent:commit",
      type: "provider-slash-command",
      provider: claudeDriver,
      command: { name: "commit" },
      label: "/commit",
      description: "Commit staged changes",
    });
    expect(plan).not.toBeNull();
    expect(applyT3workComposerMenuReplacement("something else", plan!.replacement)).toBeNull();
  });
});
