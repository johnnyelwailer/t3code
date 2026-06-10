import type { ProjectSource } from "@t3tools/project-context";

/**
 * A "work project" is backed by an external or managed work source — Jira/Atlassian, Linear,
 * GitHub, or a t3work-managed workspace. A loose `"local"` source is just a folder the user pointed
 * t3work at (their own repo / an arbitrary directory).
 *
 * This is the gate for project-setup scaffolding. Only work projects may receive the
 * agent-instruction files (`AGENTS.md` / `CLAUDE.md`), the `.t3work` setup tree, and the managed
 * `.gitignore`. Scaffolding a loose local workspace would write those files into the user's own
 * repository — the pollution this gate prevents.
 *
 * Generalizes beyond Jira on purpose: any non-`local` provider counts as a work project, so the
 * abstract "work project" concept keeps working as new providers are added.
 */
export function isWorkProjectSource(source: Pick<ProjectSource, "provider">): boolean {
  return source.provider !== "local";
}

export function isWorkProject(project: {
  readonly source: Pick<ProjectSource, "provider">;
}): boolean {
  return isWorkProjectSource(project.source);
}
