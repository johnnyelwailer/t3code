import type { ProjectShellProject } from "@t3tools/project-context";
import type { ProjectTicket } from "~/t3team/t3team-types";

export type ProjectContextPayload = {
  kind: "project";
  capturedAt: string;
  project: {
    id: string;
    title: string;
    workspaceRoot?: string;
    source: ProjectShellProject["source"];
  };
  linkedRepositoryUrls: ReadonlyArray<string>;
  workItems: ReadonlyArray<ProjectTicket>;
};

export function buildProjectContextPayload(input: {
  project: ProjectShellProject;
  linkedRepositoryUrls: ReadonlyArray<string>;
  projectTickets: ReadonlyArray<ProjectTicket>;
}): ProjectContextPayload {
  const { project, linkedRepositoryUrls, projectTickets } = input;
  return {
    kind: "project",
    capturedAt: new Date().toISOString(),
    project: {
      id: project.id,
      title: project.title,
      ...(project.workspace?.rootPath ? { workspaceRoot: project.workspace.rootPath } : {}),
      source: project.source,
    },
    linkedRepositoryUrls: [...linkedRepositoryUrls],
    workItems: [...projectTickets],
  };
}
