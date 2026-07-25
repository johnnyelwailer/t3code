import {
  defineSidecarSection,
  type SidecarComposition,
  type SidecarSectionDefinition,
} from "@t3tools/project-recipes";

function isBacklogAssigneeQuickStart(
  item: unknown,
): item is { readonly id: string; readonly workflow: { readonly surface: string } } {
  if (typeof item !== "object" || item === null) {
    return false;
  }

  const quickStart = item as {
    readonly id?: unknown;
    readonly workflow?: { readonly surface?: unknown } | undefined;
  };
  return (
    quickStart.id === "show-only-assigned-to-me" &&
    quickStart.workflow?.surface === "project.dashboard.backlog"
  );
}

const BUNDLED_SIDECAR_SECTIONS: ReadonlyArray<SidecarSectionDefinition> = [
  defineSidecarSection({
    id: "quick-starts",
    version: "1.0.0",
    title: "Quick starts",
    shortDescription: "Recipes matched to the active view.",
    surfaces: [
      "project.dashboard.backlog",
      "project.dashboard.myWork",
      "workitem.detail.sidepanel",
    ],
    component: "quick-starts",
    allowedToolGroups: ["view.state", "thread.handoff"],
    itemActions: (item) =>
      isBacklogAssigneeQuickStart(item)
        ? [
            {
              id: "apply-now",
              label: "Apply filter now",
              run: {
                kind: "tool",
                toolName: "t3team.backlog.set_assignee_filter",
                input: { mode: "current-user" },
              },
            },
          ]
        : [],
    defaults: { collapsed: false, visible: true },
  }),
  defineSidecarSection({
    id: "recent-conversations",
    version: "1.0.0",
    title: "Recent conversations",
    shortDescription: "Resume or revisit recent thread activity.",
    surfaces: [
      "project.dashboard.backlog",
      "project.dashboard.myWork",
      "workitem.detail.sidepanel",
    ],
    component: "recent-conversations",
    defaults: { collapsed: false, visible: true },
  }),
];

export const DEFAULT_SIDECAR_COMPOSITION: SidecarComposition = {
  sections: BUNDLED_SIDECAR_SECTIONS.map((section) => ({
    sectionId: section.id,
    ...(section.defaults?.visible !== undefined ? { visible: section.defaults.visible } : {}),
    ...(section.defaults?.collapsed !== undefined ? { collapsed: section.defaults.collapsed } : {}),
  })),
};

export function listBundledSidecarSections(): ReadonlyArray<SidecarSectionDefinition> {
  return BUNDLED_SIDECAR_SECTIONS;
}

export function getBundledSidecarSection(id: string): SidecarSectionDefinition | undefined {
  return BUNDLED_SIDECAR_SECTIONS.find((section) => section.id === id);
}
