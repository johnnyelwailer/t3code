import type { SidecarSectionAction } from "@t3tools/project-recipes";

import type { T3TeamDeterministicWorkflowLaunch } from "~/t3team/t3team-inlineRecipeLaunch";

export function buildT3TeamSidecarDeclaredActionLaunch(input: {
  readonly sectionId: string;
  readonly sectionTitle: string;
  readonly surface: T3TeamDeterministicWorkflowLaunch["surface"];
  readonly action: SidecarSectionAction;
  readonly itemId?: string | undefined;
  readonly allowedToolGroups?: ReadonlyArray<string> | undefined;
  readonly source?: "bundled" | "project-local" | undefined;
}): T3TeamDeterministicWorkflowLaunch {
  const step =
    input.action.run.kind === "tool"
      ? {
          kind: "tool" as const,
          id: input.action.id,
          toolName: input.action.run.toolName,
          ...(input.action.run.input ? { input: input.action.run.input } : {}),
        }
      : {
          kind: "script" as const,
          id: input.action.id,
          module: input.action.run.module,
        };

  return {
    launchId: input.itemId
      ? `${input.sectionId}.item.${input.itemId}.${input.action.id}`
      : `${input.sectionId}.section.${input.action.id}`,
    title: input.action.label,
    description: input.itemId
      ? `${input.action.label} from ${input.sectionTitle}.`
      : `${input.action.label} in ${input.sectionTitle}.`,
    surface: input.surface,
    workflow: { steps: [step] },
    ...(input.action.run.kind === "script" && input.action.run.input
      ? { parameters: input.action.run.input }
      : {}),
    ...(input.allowedToolGroups ? { allowedToolGroups: input.allowedToolGroups } : {}),
    ...(input.source ? { source: input.source } : {}),
  };
}
