import type { ProjectShellProject } from "@t3tools/project-context";

export const T3TEAM_HOME_PROJECT_ID = "__t3team-home__";

export function createHomeProject(): ProjectShellProject {
  const now = new Date().toISOString();
  return {
    id: T3TEAM_HOME_PROJECT_ID as never,
    title: "Home",
    source: {
      provider: "managed",
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function isHomeProjectId(projectId: string): boolean {
  return projectId === T3TEAM_HOME_PROJECT_ID;
}
