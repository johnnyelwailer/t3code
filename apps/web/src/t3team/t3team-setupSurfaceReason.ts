import type { ProjectSource } from "@t3tools/project-context";

import { isWorkProjectSource } from "~/t3team/t3team-isWorkProject";

/**
 * Why the first-run / setup surface is being shown at the "My work" home route.
 *
 * `"first-project"` is the honest first-run case: the user has no projects yet, or explicitly
 * reopened the setup wizard. `"no-work-project"` covers the case where projects already exist but
 * none of them (or none currently selected) is bound to a work source — the surface must not claim
 * this is a first-time setup.
 */
export type T3TeamSetupSurfaceReason =
  | { readonly kind: "first-project" }
  | { readonly kind: "no-work-project"; readonly projectTitle: string | null };

/** Single stable default/first-run reason object, so it never becomes a fresh reference-per-render prop default. */
export const T3TEAM_FIRST_PROJECT_SETUP_REASON: T3TeamSetupSurfaceReason = {
  kind: "first-project",
};

export function resolveT3TeamSetupSurfaceReason(input: {
  readonly allProjects: readonly {
    readonly id: string;
    readonly title: string;
    readonly source: Pick<ProjectSource, "provider">;
  }[];
  readonly selectedProjectId: string | null;
  readonly reopenInitialSetup: boolean;
}): T3TeamSetupSurfaceReason {
  if (input.reopenInitialSetup) return T3TEAM_FIRST_PROJECT_SETUP_REASON;
  if (input.allProjects.length === 0) return T3TEAM_FIRST_PROJECT_SETUP_REASON;

  // Only claim "no work source" when that is actually true of every known
  // project. The home surface is also reached with a work project selected —
  // e.g. a route pointing at a project id the shell does not know — and telling
  // the user their Jira-bound project is a bare local workspace would be a lie.
  if (input.allProjects.some((project) => isWorkProjectSource(project.source))) {
    return T3TEAM_FIRST_PROJECT_SETUP_REASON;
  }

  const selected = input.allProjects.find((project) => project.id === input.selectedProjectId);
  if (selected) return { kind: "no-work-project", projectTitle: selected.title };

  const [soleProject] = input.allProjects;
  const projectTitle = input.allProjects.length === 1 && soleProject ? soleProject.title : null;
  return { kind: "no-work-project", projectTitle };
}
