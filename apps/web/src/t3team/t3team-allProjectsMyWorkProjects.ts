import type { ProjectShellProject } from "@t3tools/project-context";

/**
 * Projects whose work items can be fetched at all: a local-only project has no external work
 * source, so a "my work" section for it would always be empty.
 */
export function selectBoundProjects(
  projects: ReadonlyArray<ProjectShellProject>,
): ReadonlyArray<ProjectShellProject> {
  return projects.filter((project) => project.source && project.source.provider !== "local");
}
