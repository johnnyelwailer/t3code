import type {
  RecipeSurface,
  SidecarComposition,
  SidecarPersonalization,
} from "@t3tools/project-recipes";

import type { T3TeamDeterministicWorkflowLaunch } from "~/t3team/t3team-inlineRecipeLaunch";
import {
  buildT3TeamSidecarItemResetPlan,
  buildT3TeamSidecarSectionResetPlan,
  type T3TeamSidecarResetPlan,
} from "~/t3team/t3team-sidecarPersonalizationResetState";

export const T3TEAM_SIDECAR_APPLY_PERSONALIZATION_RESET_TOOL =
  "t3team.sidecar.apply_personalization_reset";

export type T3TeamSidecarPersonalizationResetToolInput = {
  readonly nextPersonalization: SidecarPersonalization;
  readonly promptText: string;
};

function toLaunch(input: {
  readonly surface: RecipeSurface;
  readonly launchId: string;
  readonly plan: T3TeamSidecarResetPlan;
}): T3TeamDeterministicWorkflowLaunch {
  return {
    launchId: input.launchId,
    title: input.plan.launchTitle,
    description: input.plan.cardBody,
    surface: input.surface,
    workflow: {
      steps: [
        {
          kind: "present-message",
          id: "preview-reset",
          message: {
            card: {
              kind: "approval",
              id: `${input.launchId}:approve`,
              title: input.plan.cardTitle,
              body: input.plan.cardBody,
              fields: input.plan.fieldRows,
              actions: [{ id: "approve", label: "Reset to defaults", style: "danger" }],
            },
          },
        },
        {
          kind: "collect-input",
          id: "approve-reset",
          request: { kind: "card-action", actionId: "approve" },
        },
        {
          kind: "tool",
          id: "apply-reset",
          toolName: T3TEAM_SIDECAR_APPLY_PERSONALIZATION_RESET_TOOL,
          input: {
            nextPersonalization: input.plan.nextPersonalization,
            promptText: input.plan.promptText,
          },
        },
      ],
    },
    source: "bundled",
  };
}

export function buildT3TeamSidecarSectionResetLaunch(input: {
  readonly surface: RecipeSurface;
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly defaultComposition: SidecarComposition;
  readonly personalization: SidecarPersonalization;
}) {
  const plan = buildT3TeamSidecarSectionResetPlan(input);
  return plan
    ? toLaunch({
        surface: input.surface,
        launchId: `sidecar.reset-section.${input.sectionId}`,
        plan,
      })
    : null;
}

export function buildT3TeamSidecarItemResetLaunch(input: {
  readonly surface: RecipeSurface;
  readonly sectionId: string;
  readonly itemId: string;
  readonly itemTitle: string;
  readonly personalization: SidecarPersonalization;
}) {
  const plan = buildT3TeamSidecarItemResetPlan(input);
  return plan
    ? toLaunch({
        surface: input.surface,
        launchId: `sidecar.reset-item.${input.sectionId}.${input.itemId}`,
        plan,
      })
    : null;
}
