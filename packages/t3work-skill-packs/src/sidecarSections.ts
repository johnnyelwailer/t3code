import {
  defineSidecarSection,
  type SidecarComposition,
  type SidecarSectionDefinition,
} from "@t3tools/project-recipes";

const SIDECAR_SURFACES = [
  "project.dashboard.backlog",
  "project.dashboard.myWork",
  "workitem.detail.sidepanel",
] as const;

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

function defineTopicRecipeListSection(input: {
  readonly id: string;
  readonly title: string;
  readonly shortDescription: string;
}): SidecarSectionDefinition {
  return defineSidecarSection({
    id: input.id,
    version: "1.0.0",
    title: input.title,
    shortDescription: input.shortDescription,
    surfaces: [...SIDECAR_SURFACES],
    component: "recipe-list",
    allowedToolGroups: ["view.state", "thread.handoff"],
    defaults: { collapsed: false, visible: true },
  });
}

const BUNDLED_SIDECAR_SECTIONS: ReadonlyArray<SidecarSectionDefinition> = [
  defineSidecarSection({
    id: "filters",
    version: "1.0.0",
    title: "Filters",
    shortDescription: "Narrow what you see on the board.",
    surfaces: [...SIDECAR_SURFACES],
    component: "inline-filters",
    allowedToolGroups: ["view.state", "thread.handoff"],
    itemActions: (item) =>
      isBacklogAssigneeQuickStart(item)
        ? [
            {
              id: "apply-now",
              label: "Apply filter now",
              run: {
                kind: "tool",
                toolName: "t3work.backlog.set_assignee_filter",
                input: { mode: "current-user" },
              },
            },
          ]
        : [],
    defaults: { collapsed: false, visible: true },
  }),
  defineTopicRecipeListSection({
    id: "quick-actions",
    title: "Quick actions",
    shortDescription: "Simple conversation starters for the active view.",
  }),
  defineTopicRecipeListSection({
    id: "qa",
    title: "QA",
    shortDescription: "Verification and acceptance workflows.",
  }),
  defineTopicRecipeListSection({
    id: "refinement",
    title: "Refinement",
    shortDescription: "Shape stories, epics, and backlog slices.",
  }),
  defineTopicRecipeListSection({
    id: "planning",
    title: "Planning",
    shortDescription: "Sprint fit, capacity, and commitment helpers.",
  }),
  defineTopicRecipeListSection({
    id: "engineering",
    title: "Engineering",
    shortDescription: "Implementation planning and technical guidance.",
  }),
  defineTopicRecipeListSection({
    id: "delivery",
    title: "Delivery",
    shortDescription: "Unblock, handoff, and coordination moves.",
  }),
  defineTopicRecipeListSection({
    id: "customize",
    title: "Customize",
    shortDescription: "Author or edit project-local recipes and plugins.",
  }),
  defineSidecarSection({
    id: "recent",
    version: "1.0.0",
    title: "Recent",
    shortDescription: "Resume or revisit recent thread activity.",
    surfaces: [...SIDECAR_SURFACES],
    component: "recent-conversations",
    defaults: { collapsed: true, visible: true },
  }),
];

export const DEFAULT_BUNDLED_PROFILE_SIDECAR_COMPOSITION: SidecarComposition = {
  sections: [
    { sectionId: "filters" },
    { sectionId: "quick-actions" },
    { sectionId: "qa" },
    { sectionId: "refinement" },
    { sectionId: "planning" },
    { sectionId: "engineering" },
    { sectionId: "delivery" },
    { sectionId: "customize" },
    { sectionId: "recent", collapsed: true },
  ],
};

export const DEFAULT_SIDECAR_COMPOSITION: SidecarComposition =
  DEFAULT_BUNDLED_PROFILE_SIDECAR_COMPOSITION;

export function listBundledSidecarSections(): ReadonlyArray<SidecarSectionDefinition> {
  return BUNDLED_SIDECAR_SECTIONS;
}

export function getBundledSidecarSection(id: string): SidecarSectionDefinition | undefined {
  return BUNDLED_SIDECAR_SECTIONS.find((section) => section.id === id);
}
