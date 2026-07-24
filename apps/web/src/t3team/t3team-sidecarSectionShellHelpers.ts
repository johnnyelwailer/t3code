import type { ActionRecipeSurface, SidecarSectionAction } from "@t3tools/project-recipes";

import { toastManager } from "~/components/ui/toast";
import { buildT3TeamSidecarDeclaredActionLaunch } from "~/t3team/t3team-sidecarSectionActionLaunch";
import type { T3TeamSidecarSectionShellProps } from "~/t3team/t3team-sidecarSectionShellProps";
import type { useRunT3TeamDeterministicWorkflowLaunch } from "~/t3team/t3team-inlineRecipeLaunch";

export function mergeT3TeamSidecarSectionProps(
  props: unknown,
  shell: T3TeamSidecarSectionShellProps,
): Record<string, unknown> {
  return typeof props === "object" && props !== null
    ? ({ ...(props as Record<string, unknown>), shell } as Record<string, unknown>)
    : { shell };
}

export function getT3TeamSidecarItemId(item: unknown): string | null {
  if (typeof item !== "object" || item === null || !("id" in item)) {
    return null;
  }

  return typeof item.id === "string" ? item.id : null;
}

export function getT3TeamSidecarItemSourcePath(item: unknown): string | null {
  if (typeof item !== "object" || item === null || !("sourcePath" in item)) {
    return null;
  }

  return typeof item.sourcePath === "string" ? item.sourcePath : null;
}

export function getT3TeamSidecarItemLabel(item: unknown): string {
  if (
    typeof item === "object" &&
    item !== null &&
    "title" in item &&
    typeof item.title === "string"
  ) {
    return `${item.title} actions`;
  }

  return `${getT3TeamSidecarItemId(item) ?? "Item"} actions`;
}

export async function runT3TeamSidecarDeclaredAction(input: {
  readonly runWorkflowLaunch: ReturnType<typeof useRunT3TeamDeterministicWorkflowLaunch>;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly action: SidecarSectionAction;
  readonly surface: ActionRecipeSurface;
  readonly itemId?: string | undefined;
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
}) {
  const outcome = await input.runWorkflowLaunch(
    buildT3TeamSidecarDeclaredActionLaunch({
      sectionId: input.sectionId,
      sectionTitle: input.sectionTitle,
      action: input.action,
      surface: input.surface,
      ...(input.itemId ? { itemId: input.itemId } : {}),
      ...(input.allowedToolGroups ? { allowedToolGroups: input.allowedToolGroups } : {}),
      source: "bundled",
    }),
  );

  if (!outcome) {
    toastManager.add({
      type: "warning",
      title: "Action unavailable",
      description: "This recipe action is not available in the current view.",
    });
    return;
  }
  if (!outcome.applied) {
    toastManager.add({
      type: "info",
      title: "No change applied",
      description: outcome.promptText ?? "The current view is already set up that way.",
    });
    return;
  }

  toastManager.add({
    type: "success",
    title: input.action.label,
    description: outcome.promptText ?? "Applied the recipe action inline.",
  });
}
