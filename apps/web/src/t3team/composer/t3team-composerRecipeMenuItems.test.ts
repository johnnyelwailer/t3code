import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, MessageId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import type { SetStateAction } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ComposerCommandItem } from "~/components/chat/ComposerCommandMenu";
import { detectComposerTrigger } from "~/composer-logic";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import {
  attachT3TeamComposerRecipe,
  detachT3TeamComposerRecipe,
  readT3TeamComposerAttachedRecipe,
  t3teamRecipeAttachDisabledReason,
  type T3TeamComposerRecipeTarget,
} from "~/t3team/composer/t3team-composerAttachedRecipeStore";
import { appendT3TeamRecipeMenuItems } from "~/t3team/composer/t3team-composerRecipeMenuItems";
import {
  type T3TeamComposerTurnStart,
  withT3TeamAttachedRecipeTurnStart,
} from "~/t3team/composer/t3team-startAttachedRecipe";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";
import type { ChatMessage } from "~/types";

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
    messageText: "Bitte nur Verträge ab 2025",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    titleSeed: "Bitte nur Verträge ab 2025",
    runtimeMode: "full-access",
    interactionMode: "default",
    createdAt: "2026-11-07T10:00:00.000Z",
    hasAttachments: false,
  };
  const workflowRecipe: T3TeamSidecarRecipeQuickStart = {
    ...recipe("rechnung-pruefen"),
    workflow: {
      kind: "recipe",
      recipeId: "rechnung-pruefen",
      title: "Rezept rechnung-pruefen",
      description: "",
      source: "project-local",
      surface: "thread.context",
      recipePath: "/ws/.t3team/recipes/rechnung-pruefen",
      workflowPath: "/ws/.t3team/recipes/rechnung-pruefen/rechnung.workflow.ts",
    },
  };

  function hostFor(target: T3TeamComposerRecipeTarget) {
    const state: { messages: ChatMessage[] } = {
      messages: [
        {
          id: MessageId.make(turnStart.messageId),
          role: "user",
          text: turnStart.messageText,
          runId: null,
          streaming: false,
          createdAt: turnStart.createdAt,
          updatedAt: turnStart.createdAt,
        },
      ],
    };
    const hostOverride = vi.fn(async () => true);
    const setThreadError = vi.fn();
    return {
      state,
      hostOverride,
      setThreadError,
      host: {
        target,
        hostOverride,
        setThreadError,
        setOptimisticUserMessages: (action: SetStateAction<ChatMessage[]>) => {
          state.messages = typeof action === "function" ? action(state.messages) : action;
        },
      },
    };
  }

  it("starts the recipe without waiting and gives everything back when the launch fails", async () => {
    const thread = scopeThreadRef(EnvironmentId.make("env"), ThreadId.make("thread-1"));
    const { host, state, hostOverride, setThreadError } = hostFor(thread);
    attachT3TeamComposerRecipe(thread, workflowRecipe);
    let rejectLaunch: (error: Error) => void = () => undefined;
    const failed = new Promise<never>((_resolve, reject) => {
      rejectLaunch = reject;
    });
    const launch = vi.fn(() => failed);

    await expect(withT3TeamAttachedRecipeTurnStart(host, launch)(turnStart)).resolves.toBe(true);
    expect(readT3TeamComposerAttachedRecipe(thread)).toBeNull();
    expect(hostOverride).not.toHaveBeenCalled();
    expect(launch).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledWith(
      EnvironmentId.make("env"),
      expect.objectContaining({
        threadId: "thread-1",
        kickoffMessage: turnStart.messageText,
        composerKickoff: { messageId: "message-1" },
      }),
    );

    rejectLaunch(new Error("Recipes are turned off."));
    await failed.catch(() => undefined);
    expect(readT3TeamComposerAttachedRecipe(thread)?.recipe.id).toBe("rechnung-pruefen");
    expect(useComposerDraftStore.getState().getComposerDraft(thread)?.prompt).toBe(
      turnStart.messageText,
    );
    expect(state.messages).toEqual([]);
    expect(setThreadError).toHaveBeenCalledWith("thread-1", "Recipes are turned off.");
    detachT3TeamComposerRecipe(thread);
  });

  it("leaves drafts and composers without a recipe to the host override", async () => {
    const draft = DraftId.make("draft-1");
    const { host, hostOverride } = hostFor(draft);
    const launch = vi.fn(async () => undefined);
    await expect(withT3TeamAttachedRecipeTurnStart(host, launch)(turnStart)).resolves.toBe(true);
    expect(hostOverride).toHaveBeenCalledWith(turnStart);
    expect(launch).not.toHaveBeenCalled();

    const items = appendT3TeamRecipeMenuItems({
      items: [],
      trigger: slashTrigger("/rech"),
      recipes: [workflowRecipe],
      providerSlashCommands: [],
      disabledReason: t3teamRecipeAttachDisabledReason(draft),
    });
    expect(items.map((item) => item.description)).toEqual([
      "Send a first message to start the thread, then attach a recipe",
    ]);
  });
});
