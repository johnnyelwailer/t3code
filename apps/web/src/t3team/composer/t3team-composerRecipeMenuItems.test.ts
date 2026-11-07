import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import { detectComposerTrigger } from "~/composer-logic";
import { DraftId } from "~/composerDraftStore";
import {
  attachT3TeamComposerRecipe,
  detachT3TeamComposerRecipe,
  readT3TeamComposerAttachedRecipe,
} from "~/t3team/composer/t3team-composerAttachedRecipeStore";
import { appendT3TeamRecipeMenuItems } from "~/t3team/composer/t3team-composerRecipeMenuItems";
import {
  type T3TeamComposerTurnStart,
  withT3TeamAttachedRecipeTurnStart,
} from "~/t3team/composer/t3team-startAttachedRecipe";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

const sideItem: ComposerCommandItem = {
  id: "slash:side",
  type: "slash-command",
  command: "side",
  label: "/side",
  description: "Ask a side question in a new side chat",
};

function recipe(id: string, slashAlias?: string): T3TeamSidecarRecipeQuickStart {
  return {
    id,
    title: `Rezept ${id}`,
    description: "",
    prompt: "",
    ...(slashAlias ? { slashAlias } : {}),
  };
}

function slashTrigger(text: string) {
  return detectComposerTrigger(text, text.length);
}

describe("appendT3TeamRecipeMenuItems", () => {
  it("lists recipes after the host items and never under a host or provider command", () => {
    const items = appendT3TeamRecipeMenuItems({
      items: [sideItem],
      trigger: slashTrigger("/"),
      recipes: [recipe("rechnung-pruefen"), recipe("side"), recipe("x", "commit")],
      providerSlashCommands: [{ name: "commit" }],
    });
    expect(items.map((item) => item.id)).toEqual([
      "slash:side",
      "recipe-slash-command:rechnung-pruefen",
    ]);
  });

  it("leaves non-slash menus untouched", () => {
    const hostItems: ComposerCommandItem[] = [];
    const items = appendT3TeamRecipeMenuItems({
      items: hostItems,
      trigger: slashTrigger("@rech"),
      recipes: [recipe("rechnung-pruefen")],
      providerSlashCommands: [],
    });
    expect(items).toBe(hostItems);
  });
});

describe("withT3TeamAttachedRecipeTurnStart", () => {
  const turnStart: T3TeamComposerTurnStart = {
    threadId: "thread-1",
    messageId: "message-1",
    messageText: "Bitte prüfen",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    titleSeed: "Bitte prüfen",
    runtimeMode: "full-access",
    interactionMode: "default",
    createdAt: "2026-11-07T10:00:00.000Z",
    hasAttachments: false,
  };

  it("keys the attachment by composer target and still reaches the host override", async () => {
    const thread = scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("thread-1"));
    const draft = DraftId.make("draft-1");
    attachT3TeamComposerRecipe(thread, recipe("rechnung-pruefen"));
    expect(readT3TeamComposerAttachedRecipe(draft)).toBeNull();
    expect(readT3TeamComposerAttachedRecipe(thread)?.recipe.id).toBe("rechnung-pruefen");

    const hostOverride = vi.fn(async () => true);
    await expect(withT3TeamAttachedRecipeTurnStart(thread, hostOverride)(turnStart)).resolves.toBe(
      true,
    );
    expect(hostOverride).toHaveBeenCalledWith(turnStart);
    await expect(withT3TeamAttachedRecipeTurnStart(draft, undefined)(turnStart)).resolves.toBe(
      false,
    );

    detachT3TeamComposerRecipe(thread);
    expect(readT3TeamComposerAttachedRecipe(thread)).toBeNull();
  });
});
