import type { ProjectId } from "@t3tools/contracts";

/** The open thread's project, else the first project: where voice lives when it is first used. */
export function pickVoiceHomeProject(input: {
  readonly openThreadProjectId: ProjectId | null;
  readonly projectIds: ReadonlyArray<ProjectId>;
}): ProjectId | null {
  return input.openThreadProjectId ?? input.projectIds[0] ?? null;
}
