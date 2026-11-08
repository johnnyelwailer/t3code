/**
 * The recipe a composer has attached for its next send, keyed by the composer's draft target
 * (a thread ref or a draft id) — so every ChatView, side chats and drafts included, owns its own
 * attachment without knowing about work items or tickets. Pure client state: no network.
 */
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

import { composerTargetKey, type DraftId } from "~/composerDraftStore";
import type { T3TeamSelectedRecipeQuickStart } from "~/t3team/t3team-recipeQuickStartLaunch";
import type { T3TeamSidecarRecipeQuickStart } from "~/t3team/t3team-sidecarRecipeTypes";

export type T3TeamComposerRecipeTarget = ScopedThreadRef | DraftId;

type AttachedRecipeState = {
  readonly byTargetKey: Readonly<Record<string, T3TeamSelectedRecipeQuickStart>>;
};

export const useT3TeamComposerAttachedRecipeStore = create<AttachedRecipeState>(() => ({
  byTargetKey: {},
}));

/** Selecting another recipe replaces the attached one: one composer, one recipe. */
export function attachT3TeamComposerRecipe(
  target: T3TeamComposerRecipeTarget,
  recipe: T3TeamSidecarRecipeQuickStart,
): void {
  const key = composerTargetKey(target);
  useT3TeamComposerAttachedRecipeStore.setState((state) => ({
    byTargetKey: { ...state.byTargetKey, [key]: { recipe } },
  }));
}

export function detachT3TeamComposerRecipe(target: T3TeamComposerRecipeTarget): void {
  const key = composerTargetKey(target);
  useT3TeamComposerAttachedRecipeStore.setState((state) => {
    if (!(key in state.byTargetKey)) return state;
    const { [key]: _removed, ...rest } = state.byTargetKey;
    return { byTargetKey: rest };
  });
}

export function readT3TeamComposerAttachedRecipe(
  target: T3TeamComposerRecipeTarget,
): T3TeamSelectedRecipeQuickStart | null {
  return (
    useT3TeamComposerAttachedRecipeStore.getState().byTargetKey[composerTargetKey(target)] ?? null
  );
}

/** Subscribes to this target's slot only; attaching elsewhere does not re-render the caller. */
export function useT3TeamComposerAttachedRecipe(
  target: T3TeamComposerRecipeTarget,
): T3TeamSelectedRecipeQuickStart | null {
  const key = composerTargetKey(target);
  return useT3TeamComposerAttachedRecipeStore((state) => state.byTargetKey[key] ?? null);
}
